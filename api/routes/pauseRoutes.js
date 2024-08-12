const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Pause = require('../models/PauseSchema');
const { User } = require('../models/userSchema');
const { authenticateToken } = require('../middleware/Auth');

// Démarrer une pause
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        console.log('Starting pause for user:', userId); // Log

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        const pause = new Pause({
            user: userId,
            startTime: new Date(),
            isPaused: true
        });

        await pause.save();
        console.log('Pause saved:', pause); // Log

        res.status(201).json({ message: 'Pause démarrée avec succès', pause });
    } catch (error) {
        console.error('Error starting pause:', error); // Log
        res.status(500).json({ message: 'Erreur lors du démarrage de la pause', error: error.message });
    }
});

// Terminer une pause manuellement
router.post('/end', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;

        // Trouver la pause active pour cet utilisateur
        const activePause = await Pause.findOne({ user: userId, isPaused: true });

        if (!activePause) {
            return res.status(404).json({ message: 'Aucune pause active trouvée pour cet utilisateur' });
        }

        activePause.endTime = new Date();
        activePause.isPaused = false;
        activePause.duration = (activePause.endTime - activePause.startTime) / 1000; // Durée en secondes

        await activePause.save();

        res.status(200).json({ message: 'Pause terminée avec succès', pause: activePause });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la terminaison de la pause', error: error.message });
    }
});

// Obtenir le nombre de pauses pour un utilisateur à une date donnée
router.get('/count/:userId/:date', authenticateToken, async (req, res) => {
    try {
        const { userId, date } = req.params;
        const pauseCount = await Pause.getPauseCountForDate(userId, new Date(date));

        res.status(200).json({ pauseCount });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du nombre de pauses', error: error.message });
    }
});

// Récupérer toutes les pauses actives
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const activePauses = await Pause.find({ isPaused: true }).populate('user');

        res.status(200).json({ activePauses });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des pauses actives', error: error.message });
    }
});

// Récupérer les pauses d'aujourd'hui pour un utilisateur
router.get('/pauses/today', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Début de la journée

        // Trouver les pauses qui ont commencé aujourd'hui
        const pauses = await Pause.find({
            user: userId,
            startTime: { $gte: today }
        });

        // Calculer le nombre de pauses et la durée totale
        const nbrPauses = pauses.length;
        const totalPauseTime = pauses.reduce((acc, pause) => acc + (pause.duration || 0), 0);

        res.status(200).json({ nbrPauses, totalPauseTime });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des pauses', details: error.message });
    }
});

module.exports = router;
