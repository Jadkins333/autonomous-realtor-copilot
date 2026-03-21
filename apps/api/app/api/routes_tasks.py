from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.tasks import TaskCreate, TaskOut, TaskUpdate
from app.services.workspace import create_task, get_task, list_tasks, serialize_task, update_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def tasks_list(
    status: str | None = Query(default=None),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[TaskOut]:
    return [TaskOut.model_validate(item) for item in list_tasks(db, auth.tenant_id, status=status)]


@router.post("", response_model=TaskOut)
def tasks_create(
    payload: TaskCreate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> TaskOut:
    return TaskOut.model_validate(create_task(db, auth.tenant_id, auth.user_id, payload.model_dump()))


@router.get("/{task_id}", response_model=TaskOut)
def tasks_get(
    task_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> TaskOut:
    task = get_task(db, auth.tenant_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskOut.model_validate(serialize_task(db, task))


@router.put("/{task_id}", response_model=TaskOut)
def tasks_update(
    task_id: UUID,
    payload: TaskUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> TaskOut:
    try:
        item = update_task(
            db,
            auth.tenant_id,
            task_id,
            auth.user_id,
            payload.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return TaskOut.model_validate(item)
