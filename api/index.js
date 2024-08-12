const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config/config');
const http = require('http');
const { Server } = require('socket.io');
 // Importation du modèle Conversation
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const bcrypt = require('bcrypt');

const messageRoutes = require('./routes/messageRoutes');

const { Conversation } = require('./models/conversationSchema');
const { Message } = require('./models/messageSchema');
const { User } = require('./models/userSchema');
const { Pause } = require('./models/PauseSchema');  // Importation du modèle Pause


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    }
});

// Middleware pour gérer les CORS
app.use(cors());

// Middleware pour parser les JSON
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(config.MONGO_URI)
    .then(() => {
        console.log('Connecté à MongoDB');
    })
    .catch(err => {
        console.error('Erreur de connexion à MongoDB', err);
    });

let onlineUsers = {};
// Gestion des événements Socket.io
io.on('connection', (socket) => {
    console.log('Un utilisateur est connecté', socket.id);


    socket.on('userConnected', (userId) => {
        onlineUsers[userId] = true;
        console.log(`Utilisateur ${userId} est en ligne`);

        // Informer tous les clients connectés que l'utilisateur est en ligne
        io.emit('userOnlineStatus', { userId, isOnline: true });

        // Envoyer la liste des utilisateurs en ligne à ce client
        socket.emit('onlineUsers', Object.keys(onlineUsers));
    });


    // Mettre à jour un utilisateur
    socket.on('updateUser', async (data) => {
        try {
            const { userId, updates } = data;
            if (updates.password) {
                updates.password = await bcrypt.hash(updates.password, 10);
            }
            const user = await User.findByIdAndUpdate(userId, updates, { new: true });
            if (!user) {
                socket.emit('error', { error: 'Utilisateur non trouvé' });
            } else {
                io.emit('userUpdated', user); // Notifier tous les clients connectés
            }
        } catch (error) {
            socket.emit('error', { error: 'Erreur lors de la mise à jour de l\'utilisateur' });
        }
    });

    // Mettre à jour le statut de saisie "isTyping"
    socket.on('typingStatus', async (data) => {
        try {
            const { userId, isTyping } = data;
            const user = await User.findById(userId);
            if (!user) {
                socket.emit('error', { error: 'Utilisateur non trouvé' });
            } else {
                user.isTyping = isTyping;
                await user.save();
                io.emit('typingStatusUpdated', { userId, isTyping }); // Notifier tous les clients
            }
        } catch (error) {
            socket.emit('error', { error: 'Erreur lors de la mise à jour du statut de saisie' });
        }
    });

    // Bloquer un utilisateur
    socket.on('blockUser', async (data) => {
        try {
            const { userId, blockedUserId } = data;
            const user = await User.findById(userId);
            if (!user) {
                socket.emit('error', { error: 'Utilisateur non trouvé' });
            } else {
                user.blockedUsers.push(blockedUserId);
                await user.save();
                io.emit('userBlocked', { userId, blockedUserId }); // Notifier tous les clients connectés
            }
        } catch (error) {
            socket.emit('error', { error: 'Erreur lors du blocage de l\'utilisateur' });
        }
    });

    // Gestion des pauses - Démarrer une pause
    socket.on('startPause', async (data) => {
        try {
            const { userId } = data;
            console.log('Socket startPause for user:', userId); // Log

            const pause = new Pause({
                user: userId,
                startTime: new Date(),
                isPaused: true,
            });

            await pause.save();
            console.log('Pause saved via socket:', pause); // Log

            socket.emit('pauseStarted', { message: 'Pause démarrée avec succès', pause });
        } catch (error) {
            console.error('Socket Error starting pause:', error); // Log
            socket.emit('error', { message: 'Erreur lors du démarrage de la pause', details: error.message });
        }
    });

    // Terminer une pause
    socket.on('endPause', async (data) => {
        try {
            const { userId } = data;

            // Trouver la pause active
            const activePause = await Pause.findOne({ user: userId, isPaused: true });

            if (!activePause) {
                return socket.emit('error', { message: 'Aucune pause active trouvée pour cet utilisateur' });
            }

            activePause.endTime = new Date();
            activePause.isPaused = false;

            const pauseDuration = (activePause.endTime - activePause.startTime) / 1000; // Temps en secondes
            activePause.duration = pauseDuration;

            await activePause.save();

            socket.emit('pauseEnded', { message: 'Pause terminée avec succès', pause: activePause });
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la terminaison de la pause', details: error.message });
        }
    });

    // Récupérer toutes les pauses actives
    socket.on('getActivePauses', async () => {
        try {
            const activePauses = await Pause.find({ isPaused: true }).populate('user');

            socket.emit('activePauses', { activePauses });
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la récupération des pauses actives', details: error.message });
        }
    });


    // Gestion des conversations
    socket.on('createConversation', async (data) => {
        try {
            const { participants, userId } = data;

            // Trouver les utilisateurs par leurs emails
            const validParticipants = await User.find({ email: { $in: participants } });

            // Vérifiez que tous les participants sont trouvés
            if (validParticipants.length !== participants.length) {
                return socket.emit('error', { message: 'Un ou plusieurs participants sont invalides ou non trouvés.' });
            }

            // Extraire les _id des utilisateurs trouvés
            let participantIds = validParticipants.map(user => user._id);

            // Ajouter l'ID de l'utilisateur qui envoie la demande (le sender)
            if (!participantIds.includes(userId)) {
                participantIds.push(userId);
            }

            // Filtrer les valeurs nulles ou indéfinies
            participantIds = participantIds.filter(id => id != null);

            // Vérifier si c'est une conversation de groupe
            const isGroup = participantIds.length > 2;

            if (!isGroup) {
                // Vérifier si une conversation entre le sender et le receiver existe déjà
                const existingConversation = await Conversation.findOne({
                    participants: { $all: [participantIds[0], participantIds[1]] },
                    isGroup: false
                });

                if (existingConversation) {
                    return socket.emit('error', { message: 'Cette conversation existe déjà.' });
                }
            }

            // Créer la conversation
            const conversation = new Conversation({
                participants: participantIds,
                isGroup: isGroup,
            });

            await conversation.save();

            io.emit('conversationCreated', { message: 'Conversation créée avec succès !', conversation });
        } catch (error) {
            console.error('Erreur lors de la création de la conversation:', error);
            socket.emit('error', { message: 'Erreur lors de la création de la conversation', details: error.message });
        }
    });

    socket.on('deleteConversation', async (data) => {
        try {
            const { conversationId } = data;
            const conversation = await Conversation.findByIdAndDelete(conversationId);
            if (!conversation) {
                socket.emit('error', { error: 'Conversation non trouvée' });
            } else {
                io.emit('conversationDeleted', { conversationId }); // Notifier tous les clients connectés
            }
        } catch (error) {
            socket.emit('error', { error: 'Erreur lors de la suppression de la conversation' });
        }
    });

    socket.on('getConversations', async (data) => {
        try {
            const { userId } = data;

            // Récupérer les conversations où l'utilisateur est un participant
            let conversations = await Conversation.find({ participants: userId })
                .populate({
                    path: 'participants',
                    select: '-password', // Exclure le mot de passe des participants
                })
                .populate({
                    path: 'lastMessage',
                    select: 'content createdAt', // Récupérer le contenu et la date du dernier message
                });

            console.log('Conversations trouvées:', conversations); // Pour déboguer

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
                        ...participant.toObject(),
                    })),
                    lastMessage: conversation.lastMessage ? conversation.lastMessage.content : 'Aucun message',
                    lastMessageDate: conversation.lastMessage ? conversation.lastMessage.createdAt : null,
                    unreadMessagesCount: unreadMessagesCount,
                    isArchived: conversation.isArchived,
                    isGroup: conversation.isGroup,
                    conversationName: conversation.conversationName,
                    createdAt: conversation.createdAt,
                    updatedAt: conversation.updatedAt
                };
            }));

            socket.emit('conversations', conversations);

            // Rejoindre les rooms pour chaque conversation afin d'écouter les mises à jour en temps réel
            conversations.forEach(conversation => {
                socket.join(conversation.conversationId.toString());
            });

        } catch (error) {
            console.error('Erreur lors de la récupération des conversations:', error);
            socket.emit('error', { message: 'Erreur lors de la récupération des conversations', details: error.message });
        }
    });

    socket.on('joinConversation', async ({ conversationId, userId }) => {
        socket.join(conversationId.toString());
        console.log(`Utilisateur ${socket.id} a rejoint la conversation ${conversationId}`);

        try {
            // Mettre à jour les messages de l'autre participant pour les marquer comme lus
            const result = await Message.updateMany(
                { conversationId, receiver: userId, isRead: false },
                { isRead: true }
            );

            console.log(`Messages mis à jour: ${result.modifiedCount}`);

            // Notifier l'autre participant que ses messages ont été lus
            const conversation = await Conversation.findById(conversationId).populate('participants');
            conversation.participants.forEach(participant => {
                if (participant._id.toString() !== userId) {
                    io.to(participant._id.toString()).emit('messagesRead', { conversationId, userId });
                }
            });

            // Émettre un événement pour mettre à jour les conversations pour l'utilisateur
            const updatedConversations = await Conversation.find({ participants: userId })
                .populate('participants', '-password')
                .populate('lastMessage', 'content createdAt');

            socket.emit('conversations', updatedConversations);
        } catch (error) {
            console.error('Erreur lors de la mise à jour des messages comme lus:', error);
            socket.emit('error', { message: 'Erreur lors de la mise à jour des messages comme lus', details: error.message });
        }
    });




    // Créer un nouveau message
    socket.on('createMessage', async (data) => {
        try {
            const { sender, receiver, messageType, content, replyTo, conversationId } = data;

            const message = new Message({
                sender,
                receiver,
                messageType,
                content,
                replyTo,
                conversationId,
                isRead: false // Message non lu par défaut

            });

            await message.save();

            // Peupler les informations sur l'expéditeur avant d'émettre l'événement
            await message.populate('sender', 'nameAndFirstName profilePic');
            await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: message._id,
                updatedAt: new Date()
            });


            io.emit('messageCreated', message); // Notifier tous les clients connectés du nouveau message
            io.to(conversationId.toString()).emit('messageCreated', message);
            socket.to(conversationId.toString()).emit('messageCreated', message);

        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la création du message', details: error.message });
        }
        socket.on('joinConversation', async ({ conversationId, userId }) => {
            socket.join(conversationId.toString());
            console.log(`Utilisateur ${socket.id} a rejoint la conversation ${conversationId}`);

            try {
                // Mettre à jour les messages de l'autre participant pour les marquer comme lus
                const result = await Message.updateMany(
                    { conversationId, receiver: userId, isRead: false },
                    { isRead: true }
                );

                console.log(`Messages mis à jour: ${result.modifiedCount}`);

                // Notifier l'autre participant que ses messages ont été lus
                const conversation = await Conversation.findById(conversationId).populate('participants');
                conversation.participants.forEach(participant => {
                    if (participant._id.toString() !== userId) {
                        io.to(participant._id.toString()).emit('messagesRead', { conversationId, userId });
                    }
                });

                // Émettre un événement pour mettre à jour les conversations pour l'utilisateur
                const updatedConversations = await Conversation.find({ participants: userId })
                    .populate('participants', '-password')
                    .populate('lastMessage', 'content createdAt');

                socket.emit('conversations', updatedConversations);
            } catch (error) {
                console.error('Erreur lors de la mise à jour des messages comme lus:', error);
                socket.emit('error', { message: 'Erreur lors de la mise à jour des messages comme lus', details: error.message });
            }
        });


    });

    // Ajouter une réaction à un message
    socket.on('addReaction', async (data) => {
        try {
            const { messageId, reactionType, userId } = data;

            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message non trouvé' });
            }

            // Ajouter ou mettre à jour la réaction de l'utilisateur
            const existingReaction = message.reactions.find(r => r.user.toString() === userId.toString());
            if (existingReaction) {
                existingReaction.reactionType = reactionType;
            } else {
                message.reactions.push({ user: userId, reactionType });
            }

            await message.save();
            io.emit('reactionAdded', { messageId, reaction: message.reactions }); // Notifier tous les clients connectés
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de l\'ajout de la réaction', details: error.message });
        }
    });

    // Répondre à un message spécifique
    socket.on('replyToMessage', async (data) => {
        try {
            const { sender, receiver, messageType, content, conversationId } = data;
            const replyTo = data.messageId;

            const replyMessage = new Message({
                sender,
                receiver,
                messageType,
                content,
                replyTo,
                conversationId,
            });

            await replyMessage.save();
            io.emit('messageReplied', replyMessage); // Notifier tous les clients connectés de la réponse
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la réponse au message', details: error.message });
        }
    });
    socket.on('getConversationDetails', async ({ conversationId }) => {
        try {
            const conversation = await Conversation.findById(conversationId)
                .populate('participants', '-password') // Exclure le mot de passe des participants
                .populate({
                    path: 'messages',
                    populate: {
                        path: 'sender receiver', // Populer les informations des utilisateurs dans les messages
                        select: 'nameAndFirstName profilePic' // Récupérer le nom et la photo de profil
                    }
                })
                .populate('lastMessage');

            if (!conversation) {
                return socket.emit('error', { message: 'Conversation non trouvée' });
            }

            socket.emit('conversationDetails', conversation); // Envoyer les détails de la conversation au client
        } catch (error) {
            console.error('Erreur lors de la récupération des détails de la conversation:', error);
            socket.emit('error', { message: 'Erreur lors de la récupération des détails de la conversation', details: error.message });
        }
    });
// Récupérer tous les messages d'une conversation
    socket.on('getConversationMessages', async ({ conversationId }) => {
        try {
            const messages = await Message.find({ conversationId })
                .populate('sender', 'nameAndFirstName profilePic')
                .populate('receiver', 'nameAndFirstName profilePic')
                .sort({ createdAt: 1 }); // Trier par date croissante (les plus anciens en premier)

            if (!messages) {
                return socket.emit('error', { message: 'Aucun message trouvé pour cette conversation' });
            }

            socket.emit('conversationMessages', messages); // Envoyer les messages au client
        } catch (error) {
            console.error('Erreur lors de la récupération des messages de la conversation:', error);
            socket.emit('error', { message: 'Erreur lors de la récupération des messages de la conversation', details: error.message });
        }
    });


// Ajouter une réaction à un message
    socket.on('addReaction', async (data) => {
        try {
            const { messageId, reactionType, userId } = data;

            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message non trouvé' });
            }

            // Ajouter ou mettre à jour la réaction de l'utilisateur
            const existingReaction = message.reactions.find(r => r.user.toString() === userId.toString());
            if (existingReaction) {
                existingReaction.reactionType = reactionType;
            } else {
                message.reactions.push({ user: userId, reactionType });
            }

            await message.save();
            io.emit('reactionAdded', { messageId, reaction: message.reactions }); // Notifier tous les clients connectés
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de l\'ajout de la réaction', details: error.message });
        }
    });

// Mettre à jour une réaction existante
    socket.on('updateReaction', async (data) => {
        try {
            const { messageId, reactionType, userId } = data;

            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message non trouvé' });
            }

            // Mettre à jour la réaction de l'utilisateur
            const existingReaction = message.reactions.find(r => r.user.toString() === userId.toString());
            if (existingReaction) {
                existingReaction.reactionType = reactionType;
                await message.save();
                io.emit('reactionUpdated', { messageId, reaction: message.reactions }); // Notifier tous les clients connectés
            } else {
                socket.emit('error', { message: 'Réaction non trouvée pour l\'utilisateur spécifié' });
            }
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la mise à jour de la réaction', details: error.message });
        }
    });

// Supprimer une réaction
    socket.on('removeReaction', async (data) => {
        try {
            const { messageId, userId } = data;

            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message non trouvé' });
            }

            // Supprimer la réaction de l'utilisateur
            message.reactions = message.reactions.filter(r => r.user.toString() !== userId.toString());

            await message.save();
            io.emit('reactionRemoved', { messageId, reaction: message.reactions }); // Notifier tous les clients connectés
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la suppression de la réaction', details: error.message });
        }
    });
// Répondre à un message spécifique
    socket.on('replyToMessage', async (data) => {
        try {
            const { sender, receiver, messageType, content, conversationId } = data;
            const replyTo = data.messageId;

            const replyMessage = new Message({
                sender,
                receiver,
                messageType,
                content,
                replyTo,
                conversationId,
            });

            await replyMessage.save();

            // Peupler les informations sur l'expéditeur avant d'émettre l'événement
            await replyMessage.populate('sender', 'nameAndFirstName profilePic');

            io.emit('messageReplied', replyMessage); // Notifier tous les clients connectés de la réponse
        } catch (error) {
            socket.emit('error', { message: 'Erreur lors de la réponse au message', details: error.message });
        }
    });

    socket.on('archiveConversation', async (data) => {
        try {
            const { conversationId } = data;

            // Trouver et mettre à jour la conversation
            const conversation = await Conversation.findByIdAndUpdate(
                conversationId,
                { isArchived: true },
                { new: true }
            );

            if (!conversation) {
                return socket.emit('error', { message: 'Conversation non trouvée' });
            }

            // Notifier le client que la conversation a été archivée avec succès
            socket.emit('conversationArchived', { message: 'Conversation archivée avec succès', conversation });

            // Optionnel : Notifier tous les autres utilisateurs que la conversation a été archivée
            io.emit('conversationArchived', { conversationId });
        } catch (error) {
            console.error('Erreur lors de l\'archivage de la conversation:', error);
            socket.emit('error', { message: 'Erreur lors de l\'archivage de la conversation', details: error.message });
        }
    });
    socket.on('conversationArchived', (data) => {
        console.log('Conversation archivée:', data);

        // Ici, vous pouvez mettre à jour votre état ou effectuer d'autres actions nécessaires
        // comme mettre à jour la liste des conversations affichées.
        setConversations(prevConversations =>
            prevConversations.map(conversation =>
                conversation.conversationId === data.conversationId
                    ? { ...conversation, isArchived: true }
                    : conversation
            )
        );
    });


    socket.on('userLogout', (userId) => {
        console.log(`Utilisateur ${userId} se déconnecte`);

        // Retirer l'utilisateur de la liste des utilisateurs en ligne
        delete onlineUsers[userId];

        // Informer tous les clients connectés que l'utilisateur est hors ligne
        io.emit('userOnlineStatus', { userId, isOnline: false });

        // Si vous voulez effectuer d'autres actions, comme fermer la session, c'est ici que vous pouvez les ajouter
    });

    // Gestion de la déconnexion du socket
    socket.on('disconnect', () => {
        const userId = Object.keys(onlineUsers).find(key => onlineUsers[key] === socket.id);

        if (userId) {
            delete onlineUsers[userId];
            console.log(`Utilisateur ${userId} est hors ligne`);

            // Informer tous les clients connectés que l'utilisateur est hors ligne
            io.emit('userOnlineStatus', { userId, isOnline: false });
        }
    });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);  // Ajout des routes de conversation
app.use('/api/message', messageRoutes);  // Ajout des routes de conversation

// Gestion des routes non trouvées (404)
app.use((req, res, next) => {
    res.status(404).send({ error: 'Route non trouvée' });
});

// Gestion des erreurs générales
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Erreur du serveur' });
});

app.use(express.static(path.join(__dirname, 'client/build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Démarrer le serveur
server.listen(config.PORT, () => {
    console.log(`Serveur démarré sur le port ${config.PORT}`);
});
