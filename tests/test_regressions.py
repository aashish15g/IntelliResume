"""Run with: python -m unittest discover -s tests -v"""
import subprocess
import os
import sys
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from flask import Flask
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from sqlalchemy.exc import IntegrityError

from app import db
from models import User, Analysis
from services import job_matcher as jobs

# Use a dummy key when constructing the SDK client; no provider calls are made.
with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}):
    from routes import register_routes


class SkillAndRankingTests(unittest.TestCase):
    def setUp(self):
        self.model_patch = patch.object(jobs, '_embedding_model', None)
        self.attempt_patch = patch.object(jobs, '_embedding_load_attempted', False)
        self.model_patch.start()
        self.attempt_patch.start()
        self.addCleanup(self.model_patch.stop)
        self.addCleanup(self.attempt_patch.stop)

    def test_aliases_are_canonical_and_deduplicated(self):
        self.assertEqual(jobs.extract_skills_from_text('JS JavaScript TS Postgres PostgreSQL k8s'),
                         {'JavaScript', 'TypeScript', 'PostgreSQL', 'Kubernetes'})

    def test_symbol_boundaries(self):
        for text, expected in [('C++', {'C++'}), ('C#', {'C#'}),
                               ('C, C++, C#', {'C', 'C++', 'C#'}),
                               ('excellence leverage javascripted', set())]:
            with self.subTest(text=text):
                self.assertEqual(jobs.extract_skills_from_text(text), expected)

    def test_app_startup_does_not_import_embeddings(self):
        subprocess.run([sys.executable, '-c',
                        "import os, sys; os.environ['GEMINI_API_KEY']='test-key'; "
                        "from app import create_app; create_app(); "
                        "assert 'sentence_transformers' not in sys.modules; "
                        "from services import job_matcher; assert not job_matcher._embedding_load_attempted"],
                       check=True, capture_output=True)

    def test_concurrent_requests_load_model_once(self):
        model = object()
        factory = Mock(return_value=model)
        module = types.SimpleNamespace(SentenceTransformer=factory)
        with patch.dict(sys.modules, {'sentence_transformers': module}):
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda _: jobs._get_embedding_model(), range(8)))
        factory.assert_called_once_with('all-MiniLM-L6-v2')
        self.assertTrue(all(result is model for result in results))

    def test_failed_loading_is_not_retried(self):
        factory = Mock(side_effect=RuntimeError('offline'))
        module = types.SimpleNamespace(SentenceTransformer=factory)
        with patch.dict(sys.modules, {'sentence_transformers': module}), self.assertLogs(jobs.logger):
            self.assertIsNone(jobs._get_embedding_model())
            self.assertIsNone(jobs._get_embedding_model())
        factory.assert_called_once()

    def sample_jobs(self):
        return [{'title': 'Java role', 'description': 'Java'},
                {'title': 'Python role', 'description': 'Python JS'}]

    def test_missing_model_returns_keyword_ranking(self):
        with patch.object(jobs, '_get_embedding_model', return_value=None):
            ranked = jobs.rank_jobs_hybrid(['Python', 'JavaScript'], self.sample_jobs())
        self.assertEqual([j['match_score'] for j in ranked], [100, 0])
        self.assertTrue(all(j['ranking_method'] == 'keyword' for j in ranked))

    def test_inference_failure_falls_back_for_entire_batch(self):
        with patch.object(jobs, '_get_embedding_model', return_value=object()), \
             patch.object(jobs, '_semantic_score', side_effect=[95, RuntimeError('failed')]), \
             self.assertLogs(jobs.logger):
            ranked = jobs.rank_jobs_hybrid(['Python', 'JavaScript'], self.sample_jobs())
        self.assertEqual([j['match_score'] for j in ranked], [100, 0])
        self.assertTrue(all(j['semantic_score'] is None and j['ranking_method'] == 'keyword' for j in ranked))

    def test_hybrid_formula_is_preserved(self):
        with patch.object(jobs, '_get_embedding_model', return_value=object()), \
             patch.object(jobs, '_semantic_score', return_value=50):
            ranked = jobs.rank_jobs_hybrid(['Python'], [{'description': 'Python Java SQL'}])
        self.assertEqual(ranked[0]['match_score'], 40)
        self.assertEqual(ranked[0]['ranking_method'], 'hybrid')


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        for name in ['search_jobs', 'get_resume_feedback', 'user_followup']:
            provider = patch(f'routes.{name}', side_effect=AssertionError('Unexpected provider call'))
            provider.start()
            self.addCleanup(provider.stop)
        # Configure a separate engine BEFORE initialization; never use users.db.
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SECRET_KEY='test-only',
                               SQLALCHEMY_DATABASE_URI='sqlite:///:memory:')
        db.init_app(self.app)
        manager = LoginManager(self.app)
        manager.user_loader(lambda user_id: db.session.get(User, int(user_id)))
        register_routes(self.app, db, Bcrypt(self.app))
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()
        self.credentials = {'email': 'graduate@example.invalid', 'password': 'Graduate1!'}

    def tearDown(self):
        db.session.remove()
        db.engine.dispose()
        self.context.pop()

    def test_invalid_payloads_return_json(self):
        payloads = ['null', '[]', '42', '{broken', '{}',
                    '{"email":123,"password":"Graduate1!"}',
                    '{"email":"x@y.com","password":[]}']
        for route in ['/register', '/login']:
            for payload in payloads:
                with self.subTest(route=route, payload=payload):
                    response = self.client.post(route, data=payload, content_type='application/json')
                    self.assertEqual(response.status_code, 400)
                    self.assertFalse(response.json['success'])
            response = self.client.post(route, data='email=x')
            self.assertEqual(response.status_code, 400)
            self.assertTrue(response.is_json)

    def test_password_byte_limit(self):
        for password in ['A1!' + 'a' * 70, 'é' * 37, '\ud800']:
            for route in ['/register', '/login']:
                with self.subTest(route=route, password_length=len(password)):
                    response = self.client.post(route, json={**self.credentials, 'password': password})
                    self.assertEqual(response.status_code, 400)
                    self.assertTrue(response.is_json)
        response = self.client.post('/register', json={**self.credentials, 'password': 'A1!' + 'a' * 69})
        self.assertTrue(response.json['success'])

    def test_registration_and_existing_login(self):
        self.assertTrue(self.client.post('/register', json=self.credentials).json['success'])
        original_hash = User.query.first().hash_password
        self.assertTrue(self.client.post('/login', json=self.credentials).json['success'])
        self.assertTrue(self.client.get('/me').json['loggedIn'])
        self.assertEqual(User.query.first().hash_password, original_hash)
        response = self.client.post('/login', json={**self.credentials, 'password': 'Wrong1!'})
        self.assertEqual(response.status_code, 401)

    def test_password_rules_and_message(self):
        for password in ['abcdefgh1', 'abcdefgh!', 'A1!']:
            response = self.client.post('/register', json={**self.credentials, 'password': password})
            self.assertEqual(response.status_code, 400)
            self.assertIn('both a number and a special character', response.json['message'])

    def test_duplicate_registration(self):
        self.client.post('/register', json=self.credentials)
        response = self.client.post('/register', json=self.credentials)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.query.count(), 1)

    def test_duplicate_commit_rolls_back(self):
        with patch.object(db.session, 'commit', side_effect=IntegrityError('insert', {}, Exception())), \
             patch.object(db.session, 'rollback', wraps=db.session.rollback) as rollback:
            response = self.client.post('/register', json=self.credentials)
        self.assertEqual(response.status_code, 400)
        rollback.assert_called_once()
        self.assertEqual(User.query.count(), 0)
        self.assertTrue(self.client.post('/register', json=self.credentials).json['success'])

    def test_jobs_endpoint_reports_fallback(self):
        self.client.post('/register', json=self.credentials)
        self.client.post('/login', json=self.credentials)
        analysis = Analysis(user_id=User.query.first().id, job_title='Developer',
                            resume_text='Python', skills=['Python'])
        db.session.add(analysis)
        db.session.commit()
        with patch('routes.search_jobs', return_value={'jobs': [{'description': 'Python'}], 'has_more': False}), \
             patch.object(jobs, '_get_embedding_model', return_value=None):
            response = self.client.post(f'/analysis/{analysis.id}/jobs', json={'location': 'Illinois'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['ranking_method'], 'keyword')
        self.assertEqual(response.json['jobs'][0]['match_score'], 100)


if __name__ == '__main__':
    unittest.main()
