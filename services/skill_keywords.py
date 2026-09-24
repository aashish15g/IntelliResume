"""
services/skill_keywords.py

A broad list of tech skill/tool keywords, used for extracting skills
from free-text resumes and job descriptions via substring matching.

TECH_KEYWORDS — the canonical list of skill names to search for.
SKILL_ALIASES — maps common variants/abbreviations to their canonical
form in TECH_KEYWORDS, so "JS" and "JavaScript" are recognized as the
same skill, "Postgres" and "PostgreSQL" match, etc.
"""

TECH_KEYWORDS = [
    # Programming languages
    "Python", "Java", "JavaScript", "TypeScript", "C", "C++", "C#",
    "Go", "Golang", "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala",
    "R", "MATLAB", "Perl", "Dart", "Objective-C", "Bash", "Shell",
    "PowerShell", "Assembly", "Haskell", "Lua", "Elixir", "Clojure",
    "Julia", "SQL", "PL/SQL", "T-SQL",

    # Frontend
    "React", "Angular", "Vue", "Vue.js", "Svelte", "Next.js", "Nuxt.js",
    "Redux", "HTML", "HTML5", "CSS", "CSS3", "Sass", "SCSS", "Tailwind",
    "Tailwind CSS", "Bootstrap", "jQuery", "Webpack", "Vite", "Babel",
    "Three.js", "D3.js", "WebGL", "Web Components", "Storybook",

    # Backend / frameworks
    "Node.js", "Express", "Express.js", "Flask", "Django", "FastAPI",
    "Spring", "Spring Boot", "ASP.NET", ".NET", ".NET Core", "Rails",
    "Ruby on Rails", "Laravel", "Symfony", "NestJS", "GraphQL", "REST",
    "REST API", "gRPC", "WebSockets", "Microservices", "Serverless",

    # Databases
    "SQL", "MySQL", "PostgreSQL", "SQLite", "MongoDB", "Redis",
    "Cassandra", "DynamoDB", "Oracle", "MariaDB", "Elasticsearch",
    "Firebase", "Firestore", "Supabase", "Neo4j", "CouchDB",
    "Snowflake", "BigQuery", "Redshift",

    # Cloud / DevOps
    "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes",
    "Terraform", "Ansible", "Jenkins", "CI/CD", "GitHub Actions",
    "GitLab CI", "CircleCI", "Nginx", "Apache", "Linux", "Unix",
    "Cloud Computing", "EC2", "S3", "Lambda", "Cloud Functions",
    "Load Balancing", "Helm", "Prometheus", "Grafana", "Datadog",

    # Data science / ML / AI
    "Machine Learning", "Deep Learning", "Neural Networks",
    "TensorFlow", "PyTorch", "Keras", "Scikit-learn", "Pandas",
    "NumPy", "Matplotlib", "Seaborn", "OpenCV", "NLP",
    "Natural Language Processing", "Computer Vision", "LLM",
    "Large Language Models", "LangChain", "LangGraph", "RAG",
    "Hugging Face", "Gemini", "OpenAI", "GPT", "Data Analysis",
    "Data Visualization", "Data Engineering", "ETL", "Apache Spark",
    "Hadoop", "Airflow", "Kafka", "Statistics", "A/B Testing",
    "Tableau", "Power BI", "Jupyter", "MLOps", "Vector Databases",
    "FAISS", "Pinecone", "Embeddings",

    # Mobile
    "iOS", "Android", "React Native", "Flutter", "SwiftUI",
    "Xcode", "Android Studio", "Mobile Development",

    # Testing
    "Unit Testing", "Integration Testing", "Selenium", "Jest",
    "PyTest", "JUnit", "Cypress", "Playwright", "TDD", "QA",
    "Test Automation",

    # Tools / version control / project management
    "Git", "GitHub", "GitLab", "Bitbucket", "Jira", "Confluence",
    "Agile", "Scrum", "Kanban", "Postman", "Figma", "VS Code",
    "IntelliJ",

    # Architecture / concepts
    "OOP", "Object-Oriented Programming", "Data Structures",
    "Algorithms", "System Design", "Design Patterns",
    "Distributed Systems", "API Design", "Software Architecture",
    "Database Design", "Networking", "Security", "Cybersecurity",
    "OAuth", "JWT", "Encryption",

    # Game dev / other
    "Unity", "Unreal Engine", "C# Scripting", "Godot", "AutoCAD",
    "SolidWorks", "3D Printing", "Blender",

    # Office / misc
    "Excel", "Microsoft Office", "VBA", "SharePoint",
]

SKILL_ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "golang": "go",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "postgre": "postgresql",
    "mongo": "mongodb",
    "ml": "machine learning",
    "dl": "deep learning",
    "nn": "neural networks",
    "cv": "computer vision",
    "nlp": "natural language processing",
    "llm": "large language models",
    "llms": "large language models",
    "genai": "gemini",
    "ai": "machine learning",
    "react.js": "react",
    "reactjs": "react",
    "vuejs": "vue",
    "vue.js": "vue",
    "nextjs": "next.js",
    "nuxtjs": "nuxt.js",
    "nodejs": "node.js",
    "node": "node.js",
    "expressjs": "express",
    "express.js": "express",
    "dotnet": ".net",
    "asp.net core": "asp.net",
    "rails": "ruby on rails",
    "ror": "ruby on rails",
    "c sharp": "c#",
    "csharp": "c#",
    "cpp": "c++",
    "objective c": "objective-c",
    "tailwindcss": "tailwind css",
    "scss": "sass",
    "html5": "html",
    "css3": "css",
    "restful": "rest",
    "restful api": "rest api",
    "rest apis": "rest api",
    "apis": "rest api",
    "graph ql": "graphql",
    "ci": "ci/cd",
    "cd": "ci/cd",
    "continuous integration": "ci/cd",
    "continuous deployment": "ci/cd",
    "gcp": "google cloud",
    "amazon web services": "aws",
    "microsoft azure": "azure",
    "tf": "tensorflow",
    "sklearn": "scikit-learn",
    "np": "numpy",
    "oop": "object-oriented programming",
    "ds&a": "data structures",
    "dsa": "data structures",
    "unit test": "unit testing",
    "integration test": "integration testing",
    "vcs": "git",
    "source control": "git",
    "version control": "git",
    "ui/ux": "design",
    "figma design": "figma",
}


def normalize_skill(text: str) -> str:
    """Lowercases and resolves a skill/keyword through the alias map."""
    lowered = text.strip().lower()
    return SKILL_ALIASES.get(lowered, lowered)