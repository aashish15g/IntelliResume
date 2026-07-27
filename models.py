from app import db
from flask_login import UserMixin

class User(db.Model,UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key = True)
    email = db.Column(db.String(150), unique = True, nullable = False)
    hash_password = db.Column(db.String(255), nullable = False)

    analyses = db.relationship('Analysis', backref='user', lazy=True)

class Analysis(db.Model):
    __tablename__ = "analyses"

    id = db.Column(db.Integer, primary_key = True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable = False)

    job_title = db.Column(db.String(150), nullable=False)
    resume_text = db.Column(db.Text, nullable=False)
 
    score = db.Column(db.Integer)
    strengths = db.Column(db.JSON)
    skill_gaps = db.Column(db.JSON)
    suggestions = db.Column(db.JSON)
 
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    messages = db.relationship(
        'Message',
        backref = 'analysis',
        lazy=True,
        order_by = 'Message.created_at',
        cascade = 'all, delete-orphan',
    )

class Message(db.Model):

    __tablename__ = 'messages'
 
    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('analyses.id'), nullable=False)
 
    role = db.Column(db.String(10), nullable=False)  # 'user' or 'model'
    content = db.Column(db.Text, nullable=False)
 
    created_at = db.Column(db.DateTime, server_default=db.func.now())