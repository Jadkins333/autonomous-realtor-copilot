from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import Contact
from app.schemas.contacts import ContactCreate, ContactOut, ContactUpdate

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
def list_contacts(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[ContactOut]:
    return list(
        db.execute(select(Contact).where(Contact.tenant_id == auth.tenant_id).order_by(Contact.created_at.desc())).scalars()
    )


@router.post("", response_model=ContactOut)
def create_contact(
    payload: ContactCreate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = Contact(tenant_id=auth.tenant_id, **payload.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: UUID,
    payload: ContactUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}
