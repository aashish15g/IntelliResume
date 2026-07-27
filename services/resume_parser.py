import pdfplumber
import os
import re

def extract_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        default = ''
        for page in pdf.pages:
            default += (page.extract_text() or "") + "\n" 
        return default
    
def clean_text(raw_text):
    text = raw_text

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = '\n'.join(line.rstrip() for line in text.split('\n'))
    text = re.sub(r'^[●•▪◦∙]\s*', '- ', text, flags=re.MULTILINE)

    return text.strip()
   
   

   
   
   


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # go up one level from services/
    resume_path = os.path.join(project_root, 'AashishGaneshkumar_ResumeUpdated.pdf')
    default_text = extract_text(resume_path)
    cleaned_text = clean_text(default_text)
    print("=== DEFAULT ===")
    print(cleaned_text)

  
   
