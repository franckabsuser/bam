const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const utilisateurSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    nameAndFirstName: {
        type: String,
        required: true,
    },
    jeSuis: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    lastConnection: {
        type: Date,
        default: Date.now,
    },
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    isTyping: {
        type: Boolean,
        default: false,
    },
    profilePhoto: {  // Ajout du champ photo de profil
        type: String,
        default: null, // Peut être null si l'utilisateur n'a pas encore téléchargé de photo
    },
}, { timestamps: true });

// Method to validate user password
utilisateurSchema.methods.isValidPassword = async function(password) {
    try {
        return await bcrypt.compare(password, this.password);
    } catch (error) {
        console.error(error);
        return false;
    }
};

// Static method to find user by email
utilisateurSchema.statics.findByEmail = function(email) {
    return this.findOne({ email });
};

const User = mongoose.model('User', utilisateurSchema);

module.exports = { User };
