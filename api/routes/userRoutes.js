const express = require('express');
const { User } = require('../models/userSchema');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const multer = require('multer');
const path = require('path');
//
const {authenticateToken} =require('../middleware/Auth')

const router = express.Router();

// Configurer multer pour stocker les fichiers de manière appropriée
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Dossier où les images seront stockées
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Nom de fichier unique
    }
});

const upload = multer({ storage: storage });

// Route pour l'inscription
router.post('/register', upload.single('profilePhoto'), async (req, res) => {
    try {
        const { email, nameAndFirstName, jeSuis, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const profilePhoto = req.file ? req.file.filename : null;

        const user = new User({
            email,
            nameAndFirstName,
            jeSuis,
            password: hashedPassword,
            profilePhoto,
        });

        await user.save();
        res.status(201).send({ message: 'Utilisateur créé avec succès' });
    } catch (error) {
        console.error('Erreur lors de la création de l\'utilisateur', error);
        res.status(400).send({ error: 'Erreur lors de la création de l\'utilisateur' });
    }
});


// Route pour la connexion
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByEmail(email);

        if (!user || !(await user.isValidPassword(password))) {
            return res.status(401).send({ error: 'Email ou mot de passe incorrect' });
        }

        const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, { expiresIn: '1h' });
        user.lastConnection = Date.now();
        await user.save();

        res.send({ token, userId: user._id, profilePhoto: user.profilePhoto }); // Ajout de profilePhoto dans la réponse
    } catch (error) {
        res.status(400).send({ error: 'Erreur lors de la connexion' });
    }
});

// Route pour récupérer un utilisateur par ID
router.get('/user/:id',async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).send({ error: 'Utilisateur non trouvé' });
        }
        res.send(user);
    } catch (error) {
        res.status(400).send({ error: 'Erreur lors de la récupération de l\'utilisateur' });
    }
});

// Route pour mettre à jour un utilisateur
router.put('/user/:id', authenticateToken,async (req, res) => {
    try {
        const updates = req.body;
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!user) {
            return res.status(404).send({ error: 'Utilisateur non trouvé' });
        }
        res.send(user);
    } catch (error) {
        res.status(400).send({ error: 'Erreur lors de la mise à jour de l\'utilisateur' });
    }
});

// Route pour vérifier si un utilisateur est en train d'écrire (isTyping)
router.post('/user/:id/typing', authenticateToken,async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send({ error: 'Utilisateur non trouvé' });
        }
        user.isTyping = req.body.isTyping;
        await user.save();
        res.send({ message: 'Statut de saisie mis à jour' });
    } catch (error) {
        res.status(400).send({ error: 'Erreur lors de la mise à jour du statut de saisie' });
    }
});

// Route pour bloquer un utilisateur
router.post('/user/:id/block', authenticateToken,async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send({ error: 'Utilisateur non trouvé' });
        }
        user.blockedUsers.push(req.body.blockedUserId);
        await user.save();
        res.send({ message: 'Utilisateur bloqué avec succès' });
    } catch (error) {
        res.status(400).send({ error: 'Erreur lors du blocage de l\'utilisateur' });
    }
});

module.exports = router;
