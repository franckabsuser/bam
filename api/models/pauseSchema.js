const mongoose = require('mongoose');

const pauseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number }, // durée en secondes
    isPaused: { type: Boolean, default: true }
});

pauseSchema.methods.startPause = async function () {
    this.startTime = new Date();
    this.isPaused = true;
    await this.save();
};

pauseSchema.methods.endPause = async function () {
    this.endTime = new Date();
    this.duration = (this.endTime - this.startTime) / 1000; // calcul en secondes
    this.isPaused = false;
    await this.save();
};

const Pause = mongoose.model('Pause', pauseSchema);

module.exports = Pause;
