const express = require('express');
const router = express.Router();
const { Message } = require('../models/messageSchema');
const { authenticateToken } = require('../middleware/Auth');

// Créer un nouveau message
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { sender, receiver, messageType, content, replyTo, conversationId } = req.body;

        const message = new Message({
            sender,
            receiver,
            messageType,
            content,
            replyTo,
            conversationId,
        });

        await message.save();
        res.status(201).json(message);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Ajouter une réaction à un message
router.post('/:id/reactions', authenticateToken, async (req, res) => {
    try {
        const { reactionType } = req.body;
        const userId = req.user._id; // L'utilisateur qui réagit

        const message = await Message.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ message: 'Message non trouvé' });
        }

        // Ajouter ou mettre à jour la réaction de l'utilisateur
        const existingReaction = message.reactions.find(r => r.user.toString() === userId.toString());
        if (existingReaction) {
            existingReaction.reactionType = reactionType;
        } else {
            message.reactions.push({ user: userId, reactionType });
        }

        await message.save();
        res.status(200).json(message);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Répondre à un message spécifique
router.post('/:id/reply', authenticateToken, async (req, res) => {
    try {
        const { sender, receiver, messageType, content, conversationId } = req.body;
        const replyTo = req.params.id;

        const replyMessage = new Message({
            sender,
            receiver,
            messageType,
            content,
            replyTo,
            conversationId,
        });

        await replyMessage.save();
        res.status(201).json(replyMessage);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Récupérer un message par ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id)
            .populate('sender', 'nameAndFirstName profilePic')
            .populate('receiver', 'nameAndFirstName profilePic')
            .populate('replyTo', 'content');

        if (!message) {
            return res.status(404).json({ message: 'Message non trouvé' });
        }

        res.status(200).json(message);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.put('/:id/markAsRead', authenticateToken, async (req, res) => {
    try {
        const { conversationId, userId } = req.body;

        if (!conversationId || !userId) {
            return res.status(400).json({ error: "conversationId et userId sont requis" });
        }

        // Mettre à jour les messages non lus de l'autre utilisateur comme lus
        const result = await Message.updateMany(
            {
                conversationId: conversationId,
                receiver: userId,
                isRead: false
            },
            { isRead: true }
        );

        res.status(200).json({ message: "Messages mis à jour en tant que lus", modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error('Erreur lors de la mise à jour des messages:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour des messages' });
    }
});

module.exports = router;
