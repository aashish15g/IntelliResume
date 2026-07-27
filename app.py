from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from dotenv import load_dotenv
import os

load_dotenv()

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, template_folder= 'templates', static_folder= 'static')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///./users.db'

    app.secret_key = os.environ.get('SECRET_KEY')
    db.init_app(app)

    loginManager = LoginManager()
    loginManager.init_app(app)

    from models import User
    @loginManager.user_loader
    def load_user(id):
        return User.query.get(id)
    

    bcrypt = Bcrypt(app)
        

    from routes import register_routes

    register_routes(app,db,bcrypt)

    #add imports later

    migrate = Migrate(app,db)



    return app



