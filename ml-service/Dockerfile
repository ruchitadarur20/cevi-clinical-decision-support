FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 TORCH_HOME=/srv/.torch
COPY requirements.txt .
# CPU-only PyTorch wheels keep the image small.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY app ./app
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
