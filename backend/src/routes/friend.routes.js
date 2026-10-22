const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friend.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/request', authMiddleware, friendController.sendFriendRequest);
router.post('/accept', authMiddleware, friendController.acceptFriendRequest);
router.get('/list', authMiddleware, friendController.getFriends);

module.exports = router;
