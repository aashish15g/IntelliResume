from flask import render_template, request, redirect,url_for, jsonify
from models import  User, Analysis, Message
from flask_login import login_user, logout_user, current_user, login_required
import re
from services.resume_parser import extract_text,clean_text
from services.gemini_service import get_resume_feedback, user_followup

def register_routes(app,db,bcrypt):

    @app.route('/')
    def index():
        if request.method == 'GET':
            return render_template('index.html')
        
    @app.route('/register', methods=['POST'])
    def register():
        email_pattern = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        password_pattern = re.compile(r'^(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$')

        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'success': False, 'message': 'Please fill in all the fields.'}), 400

        if not email_pattern.match(email):
            return jsonify({'success': False, 'message': 'invalid email format.'}), 400
        
        if not password_pattern.match(password):
            return jsonify({'success': False, 'message': 'Password must be at least 8 characters and incude a number or special character'}), 400
        
        if User.query.filter_by(email = email).first():
            return jsonify({'success': False, 'message': 'An account with this email already exists.'}), 400
        
        hashed_password = bcrypt.generate_password_hash(password)

        user = User(email = email, hash_password = hashed_password)

        db.session.add(user)
        db.session.commit()
        return jsonify({'success': True})
    
    @app.route('/login', methods=['POST'])
    def login():
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'success': False, 'message': 'Plese fill in all the fields'}),400
        

        user = User.query.filter(User.email == email).first()

        if not user or not bcrypt.check_password_hash(user.hash_password,password):
            return jsonify({'success': False, 'message':'Invalid email or password'}),401
        
        login_user(user)
        return jsonify({'success': True})

    @app.route('/logout', methods=['POST'])
    def logout():
        logout_user()
        return jsonify({'success': True})
    
    @app.route('/me')
    def me():
        return jsonify({'loggedIn': current_user.is_authenticated})

    @app.route('/analyze', methods = ['POST'])
    @login_required
    def analyze():
        file = request.files.get('file')
        job_title = request.form.get("job_title")

        if not file or not job_title:
            return jsonify({'success': False, 'message': 'Missing file or job title.'}), 400
        
        resume_extract = extract_text(file)
        cleaned_resume = clean_text(resume_extract)

        feedback = get_resume_feedback(cleaned_resume, job_title)

        if 'error' in feedback:
            return jsonify({'success': False, 'message': feedback['error']}), 502
        
        analysis = Analysis(
            user_id = current_user.id,
            job_title = job_title,
            resume_text = cleaned_resume,
            score = feedback['score'],
            strengths = feedback['strengths'],
            skill_gaps = feedback['skill_gaps'],
            suggestions = feedback['suggestions']
        )

        db.session.add(analysis)
        db.session.commit()

        return jsonify({'success': True, 'analysis_id': analysis.id, 'feedback': feedback})


    @app.route('/history')
    @login_required
    def history():
        analyses = (
        Analysis.query
        .filter_by(user_id=current_user.id)
        .order_by(Analysis.created_at.desc())
        .all()
    )
 
        return jsonify({
            'success': True,
            'analyses': [
                {
                'id': a.id,
                'job_title': a.job_title,
                'created_at': a.created_at.isoformat(),
                }
                for a in analyses
            ],
        })


    @app.route('/analysis/<int:analysis_id>')
    @login_required
    def get_analysis(analysis_id):
        analysis = Analysis.query.get(analysis_id)

        if not analysis:
            return jsonify({'success': False, 'message': 'Analysis not found.'}), 404

        if analysis.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Analysis not found.'}), 404

        return jsonify({
            'success': True,
            'analysis_id': analysis.id,
            'feedback': {
            'score': analysis.score,
            'strengths': analysis.strengths,
            'skill_gaps': analysis.skill_gaps,
            'suggestions': analysis.suggestions,
        },
    })

    @app.route('/analysis/<int:analysis_id>/ask', methods=['POST'])
    @login_required
    def ask_analysis(analysis_id):
        analysis = Analysis.query.get(analysis_id)

        if not analysis or analysis.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Analysis not found.'}), 404

        data = request.get_json(silent =True) or {}
        question = data.get('question')

        if not question or not question.strip():
            return jsonify({'success': False, 'message': 'Please enter a question.'}), 400

        message_history = analysis.messages

        answer = user_followup(
            analysis.resume_text,
            analysis.job_title,
            message_history,
            question,
        )

        db.session.add(Message(analysis_id=analysis.id, role='user', content=question))
        db.session.add(Message(analysis_id=analysis.id, role='model', content=answer))
        db.session.commit()
 
        return jsonify({'success': True, 'answer': answer})




        


   
   
   

   
 
   
   
 
   
   
   
   
 
   
   
   
   
   
   
   
   
   
   
   

   
