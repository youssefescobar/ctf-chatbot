#!/bin/bash

# This script is for Debian/Ubuntu-based systems.
# For other distributions, use the appropriate package manager (e.g., yum for CentOS/RHEL).

# --- 1. System Updates and Dependency Installation ---

echo "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

echo "Cleaning up apt cache to save space..."
sudo apt-get clean
sudo apt-get autoremove -y

echo "Installing dependencies (python, pip, nginx, pandoc)..."
sudo apt-get install -y python3 python3-pip nginx pandoc python3.12-venv

# --- 2. Application Setup ---

echo "Creating Python virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

# --- MODIFIED INSTALLATION FOR LOW DISK SPACE ---
echo "Installing CPU-only PyTorch to save space..."
# This installs a smaller, CPU-specific version of PyTorch, which sentence-transformers needs.
pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

echo "Installing remaining Python dependencies..."
# This installs the rest of the packages from your updated requirements.txt file.
pip install --no-cache-dir -r requirements.txt
# --- END OF MODIFICATION ---

# Deactivate the virtual environment for now
deactivate

# --- 3. Nginx Configuration ---

echo "Configuring Nginx..."

# Get the absolute path to the frontend2 directory
FRONTEND_PATH=$(pwd)/frontend2

# Create Nginx configuration file
NGINX_CONF="/etc/nginx/sites-available/default"

sudo bash -c "cat > $NGINX_CONF" << EOL
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root $FRONTEND_PATH;
    index index.html;

    server_name _;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL

# --- 4. Systemd Service for Backend ---

echo "Creating systemd service for the backend..."

# Get the absolute path to the project directory and the python executable in the venv
PROJECT_PATH=$(pwd)
VENV_PYTHON_PATH=$PROJECT_PATH/venv/bin/python

# Create systemd service file
SERVICE_FILE="/etc/systemd/system/chatbot.service"

sudo bash -c "cat > $SERVICE_FILE" << EOL
[Unit]
Description=Chatbot FastAPI Backend
After=network.target

[Service]
User=$USER
Group=$(id -gn $USER)
WorkingDirectory=$PROJECT_PATH
ExecStart=$VENV_PYTHON_PATH -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# --- 5. Start Services ---

echo "Starting and enabling services..."
sudo chmod 755 /home/ubuntu
sudo chmod 755 /home/ubuntu/chatbot
sudo chmod -R 755 /home/ubuntu/chatbot/frontend2
sudo systemctl daemon-reload
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl start chatbot.service
sudo systemctl enable chatbot.service


echo "-----------------------------------------------------"
echo "Setup complete!"
echo ""
echo "Your application should now be accessible at your EC2 instance's public IP address."
echo ""
echo "Important Notes:"
echo "- Make sure your EC2 instance's security group allows inbound traffic on port 80 (HTTP)."
echo "- To check the status of the backend service, run: sudo systemctl status chatbot.service"
echo "- To see the backend logs, run: sudo journalctl -u chatbot.service -f"
echo "-----------------------------------------------------"