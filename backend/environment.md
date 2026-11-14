# Backend environment setup

## Linux (bash or zsh)

First, head into the backend folder:

```bash
cd backend
```

Create the virtual environment. You only need to do this once:

```bash
python3 -m venv .venv
```

Now activate it:

```bash
source .venv/bin/activate
```

## Windows (PowerShell or CMD)

Open a terminal in the Astrea folder and head into the backend:

```bash
cd backend
```

Create the environment. Just like on Linux, you only do this once:

```bash
py -m venv .venv
```

If Windows doesn't recognize `py`, try:

```bash
python -m venv .venv
```

To activate it in PowerShell:

```bash
.\.venv\Scripts\Activate.ps1
```

If PowerShell says it won't let you run scripts, you can open CMD and activate
it there instead. In CMD, use:

```bash
.venv\Scripts\activate.bat
```

## With the environment active (Linux and Windows)

You'll usually see `(.venv)` at the start of your terminal prompt.
With the environment active, install the project's libraries:

```bash
python -m pip install -r requirements.txt
```

To check that you're using Python from the environment:

```bash
python -c "import sys; print(sys.executable)"
```

On Linux, the path should end in `backend/.venv/bin/python`.
On Windows, it should end in `backend\.venv\Scripts\python.exe`.

Whenever you open a new terminal, just head into the backend folder and
activate the environment. No need to create it or install everything again.
Rerun the install command if we add or change libraries in `requirements.txt`.

When you're done, you can leave the environment with:

```bash
deactivate
```

## Notes

- The `.venv` folder won't be uploaded to GitHub: `.gitignore` already handles that.
- The libraries come from the prototype, though the installed versions may vary
  because most don't have a fixed version in `requirements.txt`.
- For now, this just sets up the environment. We still need to bring over the
  backend code, so there's no server to start yet.
