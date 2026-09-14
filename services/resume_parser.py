import pdfplumber
import os
import re
from decorators import log_function_time
class ResumeExtractor:

    def __init__(self,pdf_path):
        self.pdf_path = pdf_path
        self.raw_text = None
        self.cleaned_text = None


    def extract_text(self):
        with pdfplumber.open(self.pdf_path) as pdf:
            text = ''
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n" 
            self.raw_text = text
            return self.raw_text

    @staticmethod
    def clean_text(raw_text):
        text = raw_text

        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = '\n'.join(line.rstrip() for line in text.split('\n'))
        text = re.sub(r'^[●•▪◦∙]\s*', '- ', text, flags=re.MULTILINE)

        return text.strip()

    @log_function_time
    def process(self):
        self.extract_text()
        self.cleaned_text = self.clean_text(self.raw_text)
        return self.cleaned_text
   


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # go up one level from services/
    resume_path = os.path.join(project_root, 'AashishGaneshkumar_ResumeUpdated.pdf')
    resumeExtractor = ResumeExtractor(resume_path)
    cleaned_text = resumeExtractor.process()

    print("=== DEFAULT ===")
    print(cleaned_text)

  
   
