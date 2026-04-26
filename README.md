# Retirement Calculator Visualizer

A simple Flask + vanilla JS retirement calculator for learning:

- Input your current financial assumptions.
- Visualize portfolio growth year by year.
- Review retirement metrics like withdrawal rate, retirement income, and savings goals.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

## Current assumptions

This version keeps the model straightforward while adding a few practical levers:

- Inputs are grouped into personal, investment, and retirement sections.
- Contribution method is either:
  - `% of income saved`, or
  - `fixed annual contribution`.
- Each account type (traditional, Roth, brokerage) can use its own pre-tax annual return rate.
- Income can grow annually via an expected salary growth input.
- Contributions include both `% of paycheck` and a fixed annual dollar contribution.
- Each account type (traditional, Roth, brokerage) can use its own annual return rate.
- Retirement tax treatment is modeled as:
  - traditional: taxed by the user-provided retirement tax rate,
  - Roth: tax-free,
  - brokerage: taxed by the user-provided retirement tax rate.
- Portfolio chart shows post-tax portfolio value and a flat retirement goal line.
- Retirement spending target is based on today's income, retirement spending %, and inflation to retirement age.
- Retirement spending target is still based on today's income, retirement spending %, and inflation to retirement age.
