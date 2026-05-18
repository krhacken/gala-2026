// Variables d'état du jeu
let playerName = "";
let questions = [];
let currentTurn = 0;
let score = 0;
let wait = false;
let link = "";
let timer = null;

function displayScreen(id) {
    document.querySelectorAll('.ecran').forEach(e => e.classList.remove('ecran-actif'));
    document.getElementById(id).classList.add('ecran-actif');
}

// --- DÉMARRAGE DU JEU ---
async function startGame() {
    const input = document.getElementById('nom-joueur');
    if (input.value.trim() === "") {
        alert("Merci de rentrer un pseudo !");
        return;
    }
    playerName = input.value.trim();

    const reponse = await fetch('/api/start', { method: 'POST' });
    questions = await reponse.json();

    if (questions.error) {
        alert(questions.error);
        return;
    }

    currentTurn = 0;
    score = 0;
    displayScreen('ecran-jeu');
    displayTurn();
}

// --- AFFICHAGE D'UN TOUR ---
function displayTurn() {
    clearInterval(timer);

    // 10 secondes = 100 dixièmes de seconde
    let leftTime = 1000; 

    
    wait = false;
    const q = questions[currentTurn];

    timer = setInterval(() => {
        if (leftTime <= 0) {
            clearInterval(timer); // On arrête le timer à zéro
            checkAnswer(null, null, q.expected_answer, 0);
            return;
        }

        leftTime--;

        let seconds = Math.floor(leftTime / 100);
        let centiseconds = leftTime % 100;

        if (centiseconds < 10) {
            centiseconds = "0" + centiseconds 
        }

        document.getElementById('seconds').innerText = "0" + seconds;
        document.getElementById('centiseconds').innerText = centiseconds;
    }, 10); // 100 ms = 1 dixième de seconde
    
    const progress = document.getElementById('progress-tour');
    if (progress) {
        progress.value = currentTurn + 1;
    }

    document.getElementById('texte-tour').innerText = `${currentTurn + 1} / 10`;
    document.getElementById('score-actuel').innerText = `Score : ${score}`;
    document.getElementById('image-celebrite').src = q.image;

    const conteneur = document.getElementById('boutons-propositions');
    conteneur.innerHTML = "";

    q.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-primary min-h-[3rem]';
        btn.innerText = choice;
        btn.addEventListener('click', () => {
            clearInterval(timer);
            checkAnswer(btn, choice, q.expected_answer, leftTime);
        });
        conteneur.appendChild(btn);
    });
}

// --- VÉRIFICATION DE LA RÉPONSE ---
function checkAnswer(clickedBtn, givenAnswer, correctAnswer, leftTime) {
    if (wait) return;
    wait = true;

    const boutons = Array.from(document.getElementById('boutons-propositions').children);
    boutons.forEach(b => b.classList.add('btn', 'btn-disabled'));

    if (givenAnswer === correctAnswer) {
        clickedBtn.classList.remove('btn-outline', 'btn-primary', 'btn-disabled');
        clickedBtn.classList.add('btn', 'btn-success');
        score += Math.round(200 + ((leftTime/10)*8));
        document.getElementById('score-actuel').innerText = `Score : ${score}`;

    } else if (clickedBtn == null) {
        boutons.forEach(b => {
            if (b.innerText === correctAnswer) {
                b.classList.remove('btn-outline', 'btn-primary', 'btn-disabled');
                b.classList.add('btn', 'btn-success');
            }
        });
        score += 0;

    } else {
        clickedBtn.classList.remove('btn-outline', 'btn-primary', 'btn-disabled');
        clickedBtn.classList.add('btn', 'btn-error');
        boutons.forEach(b => {
            if (b.innerText === correctAnswer) {
                b.classList.remove('btn-outline', 'btn-primary', 'btn-disabled');
                b.classList.add('btn', 'btn-success');
            }
        });

        score += 0;
    }

    document.getElementById('btn-suivant').style.display = 'block';
}

function nextTurn() {
    document.getElementById('btn-suivant').style.display = 'none';
    currentTurn++;

    if (currentTurn < questions.length) {
        displayTurn();
    } else {
        endGame();
    }
}

// --- FIN DE PARTIE ET CLASSEMENT ---
async function endGame() {
    displayScreen('ecran-fin');
    document.getElementById('score-final').innerText = score;

    await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, score: score })
    });

    const reponseBoard = await fetch('/api/leaderboard');
    const classement = await reponseBoard.json();

    const tbody = document.getElementById('tbody-classement');
    tbody.innerHTML = "";

    if (score <= 2000) {
        link = "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZmJwMXJxbmd2eTNtOHFraWZxczV5d3c0YTBwbXA1YTNjMTgwZDMxZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0HenISf9DhFjaSf6/giphy.gif";
    } else if (score < 6000) {
        link = "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3eXBsbjJlZDg0djh6dmFsN3p0MHY0cHlicTA5Y3ZwYnB5c3pqam41bSZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/Ykk7PxxEzyBfLVWgqX/giphy.gif";
    } else {
        link = "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjFhMHhlMHdzaTV6M3c1YXVyYTI2ZWV4cnh3OHU2NXljMnV0MjdwNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0HeoePKZ841bZzby/giphy.gif";
    }
    document.getElementById('final_image').src = link;

    classement.forEach((joueur, index) => {
        const safeName = joueur.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        tbody.innerHTML += `
            <tr>
                <td>#${index + 1}</td>
                <td>${safeName}</td>
                <td>${joueur.best}</td>
            </tr>
        `;
    });
}
