from pydantic import BaseModel


class UserProfile(BaseModel):
    uid: str
    # Plain str: Firebase already validated it, and EmailStr rejects emulator/test domains.
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    email_verified: bool = False
