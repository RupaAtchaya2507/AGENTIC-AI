# 🛡️ Agentic AI for Autonomous Bug Bounties

An AI-powered vulnerability scanner that combines OWASP ZAP, a Flask backend, a React frontend, and Google Gemini (Gemini/Generative API) to automate bug-bounty style scans, AI analysis, and PDF reporting. This repo was developed and tested using OWASP Juice Shop (vulnerable target) running in Docker.

<img width="1911" height="1008" alt="image" src="https://github.com/user-attachments/assets/4d88e253-f65a-4bf3-b2cc-00fe49933c7e" />

##  DEMO

## 🚀 Highlights

  * Runs OWASP ZAP for automated scanning 
  * Uses an AI model (Google Gemini) to summarize & prioritize findings
  * Frontend dashboard with severity heatmap and a resizable AI chat assistant
  * Auto-generated PDF report (downloadable) with summary and remediation suggestions
  * Example vulnerable target: OWASP Juice Shop (runs in Docker)

## 🔧 Prerequisites

  * Docker (for ZAP and Juice Shop)
  * Python 3.8+ (for the Flask backend)
  * Node.js 18+ (for the React frontend)
  * Google API key for Gemini (set as GOOGLE_API_KEY)

## ▶️ Steps to Run the Project

### 1. Start the vulnerable target — OWASP Juice Shop

    Run Juice Shop in Docker (default port 3000):
  
    docker run --rm -d -p 3000:3000 --name juice-shop bkimminich/juice-shop
  
    Juice Shop will be available at http://localhost:3000. This is a safe test target — do not scan other people’s sites without permission.

### 2. Run OWASP ZAP (scanner) in Docker

    Start ZAP in daemon mode (listening on port 8080):
  
    docker run --rm -d -p 8080:8080 --name zap ghcr.io/zaproxy/zaproxy:stable zap.sh -daemon -host 0.0.0.0
  
    ZAP will be available at http://localhost:8080. The backend talks to ZAP via this host+port.

### 3. Run the Flask Backend

    1) Open a new terminal and go to the backend folder:
  
      cd backend
  
    2) (Optional) Create & activate virtual environment:
  
      python -m venv venv
      .\venv\Scripts\Activate.ps1
  
    3) Install dependencies:
  
      pip install -r requirements.txt
  
    4) Set your Google API key (PowerShell example):
  
      $env:GOOGLE_API_KEY="your_api_key_here"
  
    5) Start the backend:
  
      python app.py

### 4. Run the React Frontend

    1) Open another terminal and go to the frontend folder:
      cd frontend
  
    2) Install dependencies:
      npm install
  
    3) Start the development server:
      npm run dev
  
    Frontend runs at: http://localhost:3000

### 5. Use the Application

   1) Open http://localhost:3000 in your browser (the React UI).
   
   2) Enter a URL to scan (e.g., http://localhost:3000 → Juice Shop).
   
   3) Select scan level:
   
       Level 1 → Basic (Spider)
       
       Level 2 → Spider + Active Scan
       
       Level 3 → Firewall/headers checks too
   
   4) Click Start Scan 🚀
   
   5) View results in dashboard:
   
       Severity heatmap
       
       Vulnerability details
       
       AI-powered summary
       
       Chat with AI assistant
   
   6) Click Download PDF Report to save a detailed scan report.

## 🛠️ Tech Stack

![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB) 
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white) 
![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white) 
![OWASP ZAP](https://img.shields.io/badge/OWASP_ZAP-FF7F2A?logo=owasp&logoColor=white) 
![OWASP Juice Shop](https://img.shields.io/badge/OWASP_Juice_Shop-FF5733?logo=owasp&logoColor=white) 
![Google Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?logo=google&logoColor=white) 
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

     



