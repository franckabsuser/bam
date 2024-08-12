const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Conversation } = require('../models/conversationSchema');
//
const {authenticateToken} =require('../middleware/Auth')

// Créer une nouvelle conversation
router.post('/', authenticateToken,async (req, res) => {
    try {
        const conversation = new Conversation(req.body);
        await conversation.save();
        res.status(201).json(conversation);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.query.userId;

        // Récupérer les conversations où l'utilisateur est un participant
        let conversations = await Conversation.find({ participants: userId })
            .populate({
                path: 'participants',
                select: 'name profilePic', // Récupérer le nom et la photo de profil des participants
            })
            .populate({
                path: 'lastMessage',
                select: 'content createdAt', // Récupérer le contenu et la date du dernier message
            });

        // Formatage des données
        conversations = await Promise.all(conversations.map(async (conversation) => {
            const otherParticipants = conversation.participants.filter(participant => participant._id.toString() !== userId);

            const unreadMessagesCount = await Message.countDocuments({
                conversationId: conversation._id,
                receiver: userId,
                isRead: false
            });

            return {
                conversationId: conversation._id,
                participants: otherParticipants.map(participant => ({
                    name: participant.name,
                    profilePic: participant.profilePic
                })),
                lastMessage: conversation.lastMessage ? conversation.lastMessage.content : 'Aucun message',
                lastMessageDate: conversation.lastMessage ? conversation.lastMessage.createdAt : null,
                unreadMessagesCount: unreadMessagesCount,
            };
        }));

        res.status(200).json(conversations);
    } catch (error) {
        console.error('Erreur lors de la récupération des conversations:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des conversations', details: error.message });
    }
});

// Obtenir une conversation par ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', '-password')
            .populate('messages')
            .populate('lastMessage');

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation non trouvée' });
        }
        res.status(200).json(conversation);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Mettre à jour une conversation par ID
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const conversation = await Conversation.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation non trouvée' });
        }
        res.status(200).json(conversation);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Supprimer une conversation par ID
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const conversation = await Conversation.findByIdAndDelete(req.params.id);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation non trouvée' });
        }
        res.status(200).json({ message: 'Conversation supprimée avec succès' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Archiver une conversation par ID
router.put('/:id/archive', authenticateToken, async (req, res) => {
    try {
        const conversation = await Conversation.findByIdAndUpdate(
            req.params.id,
            { isArchived: true },
            { new: true }
        );
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation non trouvée' });
        }
        res.status(200).json({ message: 'Conversation archivée avec succès', conversation });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


module.exports = router;
