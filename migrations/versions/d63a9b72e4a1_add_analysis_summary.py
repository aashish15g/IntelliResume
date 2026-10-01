"""Store the Gemini overview for each analysis.

Revision ID: d63a9b72e4a1
Revises: aaf2b65c0709
"""
from alembic import op
import sqlalchemy as sa

revision = 'd63a9b72e4a1'
down_revision = 'aaf2b65c0709'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('analyses') as batch_op:
        batch_op.add_column(sa.Column('summary', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('analyses') as batch_op:
        batch_op.drop_column('summary')
