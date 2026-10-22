const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const upload = require('../middlewares/upload.middleware');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/upload', authMiddleware, upload.single('file'), fileController.uploadFile);

module.exports = router;
