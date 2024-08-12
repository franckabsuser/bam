const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

const reactionSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reactionType: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'], required: true }
}, { _id: false });



const messageSchema = new mongoose.Schema({
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'url', 'image', 'file'],
        default: 'text',
    },
    content: {
        type: String,
        required: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    replyTo: {
        type: Schema.Types.ObjectId,
        ref: 'Message', // Référence au message auquel on répond
    },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    reactions: [reactionSchema] // Réactions
}, { timestamps: true });


const Message = mongoose.model('Message', messageSchema);


module.exports = {
    Message,
};
