# ![CTF Writeup Generator](frontend2/logo.png) CTF Writeup Generator

> Effortlessly generate detailed, professional-grade CTF (Capture The Flag) writeups from your notes. This tool combines your step-by-step solutions with AI-powered elaboration and a slick UI to produce comprehensive markdown and DOCX reports.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-username/your-repo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/)
[![Framework: FastAPI](https://img.shields.io/badge/framework-FastAPI-green)](https://fastapi.tiangolo.com/)

---

## ✨ Features

*   **📝 AI-Powered Content Generation:** Leverages Google's Gemini model to expand your brief notes into a full, detailed writeup.
*   **🧠 RAG-Based Few-Shot Learning:** Uses a Pinecone vector database to find relevant examples from past writeups, ensuring the generated content matches the desired style and tone.
*   **🖼️ Seamless Asset Integration:** Easily add and manage images and code snippets directly in the UI.
*   **📄 Multiple Export Options:** Download your final writeup as a ZIP package (Markdown + images) or a self-contained DOCX file.
*   **🎨 Modern & Responsive UI:** A clean, intuitive, and dark-mode interface for a great user experience.
*   **🚀 One-Click Deployment:** Includes a `run.sh` script to set up and deploy the entire application on a fresh EC2 instance.

## 📸 Screenshots

*A screenshot of the main application interface would go here.*

## 🛠️ Technology Stack

| Component | Technology |
| :--- | :--- |
| **Backend** | Python, FastAPI, Uvicorn, Google Gemini, Pinecone, Sentence-Transformers, PyPandoc |
| **Frontend** | HTML, CSS, JavaScript |
| **Deployment** | Nginx, Systemd, Bash (for `run.sh`) |

## 🚀 Getting Started

### Prerequisites

*   Python 3.9+
*   `pip` and `venv`
*   An account with [Google AI Studio](https://aistudio.google.com/) to get a `GOOGLE_API_KEY`.
*   (Optional) An account with [Pinecone](https://www.pinecone.io/) to get a `PINECONE_API_KEY` for the RAG feature.

### Local Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/your-repo.git
    cd your-repo
    ```

2.  **Create a `.env` file:**
    Create a file named `.env` in the root of the project and add your API keys:
    ```
    GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
    PINECONE_API_KEY="YOUR_PINECONE_API_KEY"
    ```

3.  **Set up the backend:**
    ```bash
    # Create and activate a virtual environment
    python3 -m venv venv
    source venv/bin/activate

    # Install dependencies
    pip install -r requirements.txt

    # Run the FastAPI server
    uvicorn main:app --reload
    ```
    The backend will be running at `http://127.0.0.1:8000`.

4.  **Launch the frontend:**
    Open the `frontend2/index.html` file in your web browser.

## ☁️ Deployment (EC2)

This project includes a `run.sh` script to automate deployment on a Debian-based Linux server (like Ubuntu on EC2).

1.  **Upload the project:**
    Copy the entire project directory to your EC2 instance.

2.  **Make the script executable:**
    ```bash
    chmod +x run.sh
    ```

3.  **Run the script:**
    ```bash
    sudo ./run.sh
    ```

4.  **Configure Security Group:**
    In your EC2 dashboard, ensure the security group for your instance allows inbound traffic on **Port 80 (HTTP)**.

Your application will be live at your EC2 instance's public IP address.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
