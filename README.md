# Finances Simulator

Local web app to model household finances (cash, ISA, pensions, income, expenses, mortgage) and simulate retirement outcomes.

## Backend (FastAPI)

- Install:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

- Run:

```bash
uvicorn backend.main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

## Frontend (React + Vite)

- Install:

```bash
cd frontend
npm install
```

- Run:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

## Notes

- UK tax modeling is implemented with **basic assumptions** (income tax bands + NI + simplified pension relief) in `backend/simulation/tax/`.
- Config scenarios are stored in SQLite (default `finances.db`).

