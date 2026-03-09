from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Tenant, User
from app.schemas.auth import LoginRequest, TokenResponse
from app.utils.security import create_access_token, verify_password

router = APIRouter(prefix='/auth', tags=['auth'])

@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    tenant = db.execute(select(Tenant).where(Tenant.slug == payload.tenant_slug)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    user = db.execute(select(User).where(User.tenant_id == tenant.id, User.email == payload.email)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    token = create_access_token(user.id, user.tenant_id, user.role.value)
    return TokenResponse(
        access_token=token,
        user={
            'id': str(user.id),
            'tenant_id': str(user.tenant_id),
            'email': user.email,
            'name': user.name,
            'role': user.role.value,
        },
    )
