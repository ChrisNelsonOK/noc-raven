# Quick Web Console Diagnosis

## Step 1: Try HTTP Instead of HTTPS
```bash
# ❌ WRONG: https://localhost:9080  
# ✅ CORRECT: http://localhost:9080
```

## Step 2: Run These Commands (copy/paste all at once)
```bash
echo "=== Container Status ==="
docker ps | grep noc-raven

echo "=== Port Bindings ==="
docker port noc-raven-web

echo "=== Recent Logs ==="
docker logs noc-raven-web --tail 20

echo "=== Internal Health ==="
docker exec noc-raven-web curl -f http://localhost:8080/health 2>/dev/null || echo "Health check failed"

echo "=== Running Processes ==="
docker exec noc-raven-web ps aux | grep -E "(nginx|node|python)"

echo "=== Listening Ports ==="
docker exec noc-raven-web netstat -tlnp | grep -E "(8080|5004)"
```

## Step 3: Share Output
Copy the output from Step 2 commands to help identify the specific issue.

## Emergency Alternative
If nothing works, try this direct access:
```bash
docker run -d --name noc-raven-direct \
  -p 8080:8080 \
  noc-raven:test --mode=web

# Then access: http://localhost:8080
```