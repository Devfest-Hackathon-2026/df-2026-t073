FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr for Cloud Logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# JMdict dictionary for instant Tango cards (downloaded and built at image build)
RUN python scripts/build_jmdict.py --allow-fail

# Create and switch to a non-root user for security
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# Bind to $PORT injected by Cloud Run and trust Cloud Run's load balancer proxy headers
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]

