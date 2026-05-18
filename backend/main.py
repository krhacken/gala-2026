from sqlmodel import Session, select, col
from contextlib import asynccontextmanager
from database import create_db_and_tables, get_session
from models import *
from pydantic import BaseModel, field_validator
import random
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi import *
import html
import shutil
import uuid
import os
import secrets
from dotenv import load_dotenv

class ScorePayload(BaseModel):
    name: str
    score: int

    @field_validator('name')
    def cleaner(cls, value):
        return html.escape(value)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
load_dotenv()
security = HTTPBasic()

def admin_check(credentials: HTTPBasicCredentials = Depends(security)):
    username = os.getenv("ADMIN_USER", "wrong")
    password = os.getenv("ADMIN_PASSWORD", "wrong")

    username_check = secrets.compare_digest(credentials.username, username)
    password_check = secrets.compare_digest(credentials.password, password)
    
    if not (username_check and password_check):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants erronés",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# app.mount("/image", StaticFiles(directory="image"), name="image")
app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/static", StaticFiles(directory="../frontend"), name="static")




@app.post("/api/start")
def start_game(session: Session = Depends(get_session)): # Depends : automatically open and close database cleanly
    all_celebtrities = session.exec(select(Celebrity)).all()

    if len(all_celebtrities) < 13:
        return {"error": "pas assez de donnée pour générer une partie"}

    correct_answers = random.sample(all_celebtrities, 10)

    game = []

    for correct_answer in correct_answers :
        others = [c for c in all_celebtrities if c.id != correct_answer.id and c.gender == correct_answer.gender]

        wrong_answers = random.sample(others, 3)

        choices = [correct_answer.name] + [f.name for f in wrong_answers]

        random.shuffle(choices)


        game.append({
            "image": correct_answer.image,
            "expected_answer": correct_answer.name,
            "choices": choices
        })

    return game



@app.post("/api/score")
def save_score(payload: ScorePayload, session = Depends(get_session)):
    player = session.exec(select(Player).where(Player.name == payload.name)).first()

    if player : 
        if payload.score > player.best:
            player.best = payload.score
            session.add(player)
            session.commit()
            return {"message": "Meilleur score enregistré"}
        else:
            return {"message": "pas de nouveau record..."}
    else:
        new_player = Player(name=payload.name, best=int(payload.score))
        session.add(new_player)
        session.commit()
        return {"message": "Nouveau joueur est son score enregistré"}



@app.post('/api/admin/celebrity/create')
async def add_celebrity(name: str = Form (...), image: UploadFile = File(...), gender: Gender = Form(...), session: Session = Depends(get_session), admin: str = Depends(admin_check)):
    if not image.filename.endswith(('.png', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, details="Format de fichier non supporté")

    extension = image.filename.split('.')[-1]
    new_filename = f"{uuid.uuid4()}.{extension}"
    path = f"images/{new_filename}"

    os.makedirs("images", exist_ok=True)
    with open(path, "wb") as buffer :   
        shutil.copyfileobj(image.file, buffer)

    new_celebrity = Celebrity(
        name = name,
        image = path,
        gender = gender
    )

    session.add(new_celebrity)
    session.commit()
    session.refresh(new_celebrity)

    return {"message": f"Célébrité '{name}' ajoutée avec succès !", "id": new_celebrity.id}

@app.get("/api/admin/celebrity/all")
async def get_all_celebrities(session: Session = Depends(get_session), admin: str = Depends(admin_check)):
    list = session.exec(select(Celebrity)).all()

    if not list:
        raise HTTPException(
            status_code=404,
            detail="Pas d'éléments dans la base de données"
        )

    return list


@app.delete('/api/admin/celebrity/delete/{target_id}')
async def delete_celebrity(target_id: int, session: Session = Depends(get_session), admin: str = Depends(admin_check)):
    target = session.get(Celebrity, target_id)
    
    if not target:
        raise HTTPException(
            status_code=404,
            detail="Id innexistant"
        )

    path = target.image.lstrip("/")

    if os.path.exists(path):
        os.remove(path)


    session.delete(target)
    session.commit()



    return {"message": f"{target.name} supprimé"}

@app.get("/api/leaderboard")
def get_board(session: Session = Depends(get_session)):
    query = select(Player).order_by(col(Player.best).desc())
    board = session.exec(query).all()

    return board


@app.delete("/api/admin/player/delete/{target_id}")
def delete_user(target_id: int, session: Session = Depends(get_session), admin: str = Depends(admin_check)):
    target = session.get(Player, target_id)
    
    if not target:
        raise HTTPException(
            status_code=404,
            detail = "Joueur innexistant"
        )

    session.delete(target)
    session.commit()

    return {"message": f"{target.name} supprimé"}


@app.get('/docs', include_in_schema=False)
async def get_documentation(username: str = Depends(admin_check)):
    return get_swagger_ui_html(openapi_url="/openapi.json", title="Documentation & Administration")

@app.get("/openapi.json", include_in_schema=False)
async def openapi(username: str = Depends(admin_check)):
    return get_openapi(title="API de l'activité du Gala de L'Esisar 2026", version="1.0.0", routes=app.routes)

@app.get('/')
def index():
    return FileResponse("../frontend/index.html")


@app.get('/leaderboard')
def leaderboard():
    return FileResponse('../frontend/leaderboard.html')

