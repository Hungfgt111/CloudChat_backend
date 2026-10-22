const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/messages', authMiddleware, chatController.sendMessage);
router.get('/messages', authMiddleware, chatController.getMessages);
router.delete('/messages/:id', authMiddleware, chatController.deleteMessage);

module.exports = router;
