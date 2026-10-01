"""Reject private-file names in the Git index; never read their contents."""
import fnmatch
import subprocess
import sys


def private_path(path):
    parts = path.replace('\\', '/').split('/')
    if any(part in {'.venv', 'venv', 'instance', 'uploads', '.aws',
                    '.local-tools', '.local-backups', '__pycache__'} for part in parts):
        return True
    name = parts[-1].lower()
    if name.startswith('.env'):
        return name != '.env.example'
    return any(fnmatch.fnmatch(name, pattern) for pattern in
               ['*.pem', '*.key', '*credentials*.json', '*service-account*.json',
                '*.db', '*.db-*', '*.sqlite', '*.sqlite-*', '*.sqlite3', '*.sqlite3-*',
                '*.pdf', '*.log', '*.pyc'])


def main():
    paths = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    forbidden = [path for path in paths if path and private_path(path)]
    if forbidden:
        print('Remove these private/generated files from the Git index:', file=sys.stderr)
        for path in forbidden:
            print(path, file=sys.stderr)
        return 1
    print('No private-file names in the Git index.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
