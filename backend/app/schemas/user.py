from pydantic import BaseModel, EmailStr


class UserProfile(BaseModel):
    uid: str
    email: EmailStr | None = None
    name: str | None = None
    picture: str | None = None
    email_verified: bool = False
