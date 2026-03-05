from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Contact, Message, Sequence, SequenceEnrollment, SequenceStep
from app.models.enums import EnrollmentState, MessageDirection, MessageStatus


def list_sequences(db: Session, tenant_id: UUID) -> list[dict]:
    sequences = list(
        db.execute(select(Sequence).where(Sequence.tenant_id == tenant_id).order_by(Sequence.name.asc())).scalars()
    )
    payload = []
    for seq in sequences:
        steps = list(
            db.execute(
                select(SequenceStep)
                .where(SequenceStep.sequence_id == seq.id)
                .order_by(SequenceStep.step_order.asc())
            ).scalars()
        )
        payload.append(
            {
                "id": str(seq.id),
                "key": seq.key,
                "name": seq.name,
                "description": seq.description,
                "is_enabled": seq.is_enabled,
                "sandbox_only": seq.sandbox_only,
                "steps": [
                    {
                        "id": str(step.id),
                        "step_order": step.step_order,
                        "delay_minutes": step.delay_minutes,
                        "channel": step.channel.value,
                        "template_subject": step.template_subject,
                        "template_body": step.template_body,
                        "stop_on_reply": step.stop_on_reply,
                    }
                    for step in steps
                ],
            }
        )
    return payload


def enroll_contact_in_sequence(db: Session, tenant_id: UUID, sequence_id: UUID, contact_id: UUID) -> dict:
    sequence = db.execute(
        select(Sequence).where(Sequence.id == sequence_id, Sequence.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not sequence:
        raise ValueError("Sequence not found")

    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise ValueError("Contact not found")

    first_step = db.execute(
        select(SequenceStep)
        .where(SequenceStep.sequence_id == sequence.id)
        .order_by(SequenceStep.step_order.asc())
        .limit(1)
    ).scalar_one_or_none()
    if not first_step:
        raise ValueError("Sequence has no steps")

    enrollment = SequenceEnrollment(
        tenant_id=tenant_id,
        sequence_id=sequence.id,
        contact_id=contact.id,
        state=EnrollmentState.active,
        enrolled_at=datetime.now(tz=UTC),
        next_step_at=datetime.now(tz=UTC),
        meta_json={"next_step_order": first_step.step_order},
    )
    db.add(enrollment)
    db.flush()

    message = Message(
        tenant_id=tenant_id,
        contact_id=contact.id,
        channel=first_step.channel,
        direction=MessageDirection.outbound,
        status=MessageStatus.draft,
        subject=first_step.template_subject,
        body=first_step.template_body.format(contact_name=contact.name),
        meta_json={
            "sequence_id": str(sequence.id),
            "enrollment_id": str(enrollment.id),
            "step_order": first_step.step_order,
        },
    )
    db.add(message)
    db.commit()

    return {
        "enrollment_id": str(enrollment.id),
        "sequence_id": str(sequence.id),
        "contact_id": str(contact.id),
        "state": enrollment.state.value,
        "first_draft_message_id": str(message.id),
    }


def advance_sequence_steps(db: Session) -> int:
    now = datetime.now(tz=UTC)
    enrollments = list(
        db.execute(
            select(SequenceEnrollment).where(
                SequenceEnrollment.state == EnrollmentState.active,
                SequenceEnrollment.next_step_at.is_not(None),
                SequenceEnrollment.next_step_at <= now,
            )
        ).scalars()
    )

    created = 0
    for enrollment in enrollments:
        step_order = int(enrollment.meta_json.get("next_step_order", 1))
        current_step = db.execute(
            select(SequenceStep).where(
                SequenceStep.sequence_id == enrollment.sequence_id,
                SequenceStep.step_order == step_order,
            )
        ).scalar_one_or_none()
        if not current_step:
            enrollment.state = EnrollmentState.completed
            enrollment.next_step_at = None
            continue

        existing_messages = list(
            db.execute(
                select(Message).where(
                    Message.tenant_id == enrollment.tenant_id,
                    Message.contact_id == enrollment.contact_id,
                    Message.direction == MessageDirection.outbound,
                )
            ).scalars()
        )
        already_exists = any(
            str(msg.meta_json.get("enrollment_id")) == str(enrollment.id)
            and int(msg.meta_json.get("step_order", -1)) == step_order
            for msg in existing_messages
        )
        if not already_exists:
            contact = db.execute(select(Contact).where(Contact.id == enrollment.contact_id)).scalar_one()
            db.add(
                Message(
                    tenant_id=enrollment.tenant_id,
                    contact_id=enrollment.contact_id,
                    channel=current_step.channel,
                    direction=MessageDirection.outbound,
                    status=MessageStatus.draft,
                    subject=current_step.template_subject,
                    body=current_step.template_body.format(contact_name=contact.name),
                    meta_json={
                        "sequence_id": str(enrollment.sequence_id),
                        "enrollment_id": str(enrollment.id),
                        "step_order": current_step.step_order,
                    },
                )
            )
            created += 1

        next_step = db.execute(
            select(SequenceStep)
            .where(
                SequenceStep.sequence_id == enrollment.sequence_id,
                SequenceStep.step_order > current_step.step_order,
            )
            .order_by(SequenceStep.step_order.asc())
            .limit(1)
        ).scalar_one_or_none()

        enrollment.last_step_at = now
        if next_step:
            enrollment.meta_json["next_step_order"] = next_step.step_order
            enrollment.next_step_at = now + timedelta(minutes=next_step.delay_minutes)
        else:
            enrollment.state = EnrollmentState.completed
            enrollment.next_step_at = None

    db.commit()
    return created
