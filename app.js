const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const REPO_NAME = 'bot-requests-db';
const FILE_PATH = 'requests.json';

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});

// Fungsi untuk inisialisasi Repo dan File secara otomatis
async function initDB() {
  try {
    await github.get(`/repos/${GITHUB_USERNAME}/${REPO_NAME}`);
  } catch (err) {
    if (err.response?.status === 404) {
      await github.post('/user/repos', { name: REPO_NAME, private: true, auto_init: true });
      await new Promise(r => setTimeout(r, 2000)); // Tunggu github selesai inisialisasi
    }
  }

  try {
    const file = await github.get(`/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`);
    return file.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const emptyData = { requests: [] };
      const content = Buffer.from(JSON.stringify(emptyData, null, 2)).toString('base64');
      const res = await github.put(`/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`, {
        message: 'Auto-create database',
        content: content
      });
      return res.data.content;
    }
  }
}

// Endpoint untuk mengambil semua request (Dipakai oleh UI dan Bot WA)
app.get('/api/data', async (req, res) => {
  try {
    const fileData = await initDB();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// Endpoint untuk mengirim request baru
app.post('/api/request', async (req, res) => {
  const { name, type, message } = req.body;
  
  if (!name || !type || !message) {
    return res.status(400).json({ error: 'Semua kolom harus diisi' });
  }

  try {
    const fileData = await initDB();
    const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    
    const newRequest = {
      id: Date.now(),
      date: new Date().toISOString(),
      name,
      type, // 'Lagu' atau 'Fitur'
      message
    };

    currentContent.requests.push(newRequest);

    const updatedContentBase64 = Buffer.from(JSON.stringify(currentContent, null, 2)).toString('base64');
    
    await github.put(`/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`, {
      message: `New Request from ${name}`,
      content: updatedContentBase64,
      sha: fileData.sha // Wajib menyertakan SHA lama untuk update file di GitHub
    });

    res.json({ success: true, data: newRequest });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menyimpan request' });
  }
});

module.exports = app;
