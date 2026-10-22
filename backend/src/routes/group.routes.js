const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/create', authMiddleware, groupController.createGroup);
router.get('/my-groups', authMiddleware, groupController.getMyGroups);
router.post('/add-member', authMiddleware, groupController.addMember);

module.exports = router;
