# RAG Chatbot

This is a Retrieval-Augmented Generation (RAG) chatbot that answers questions based on local PDF documents.  
It uses a Node.js backend, a React frontend, and a Hugging Face Inference Endpoint as the language model.

---

## 🧩 Project Structure
```
chatbot/
├── server/ # Node.js backend
│ ├── index.js
│ ├── rag.js
│ ├── data/ # Place your PDF files here
│ ├── .env # Environment variables (HF_URL, HF_TOKEN, etc.)
│ └── package.json
│
├── web/ # React frontend built with Vite
│ ├── src/
│ ├── index.html
│ ├── .env
│ └── package.json
│
└── README.md
```
## ⚙️ Requirements

- Node.js 18 or newer
- npm 9 or newer
- Hugging Face account with an inference endpoint and API token

## Start the backend
```
cd server
npm install
npm start 
```

## Start the Frontend
```
cd web
npm install
npm run dev
```

