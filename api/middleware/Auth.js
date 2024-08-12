const jwt = require('jsonwebtoken');
const config = require('../config/config');

const JWT_SECRET = config.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables.');
}

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token ||
        (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer ') && req.headers['authorization'].split(' ')[1]);

    if (!token) {
        return res.status(403).json({ message: 'Access denied, no token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Token verification error:', err);
            return res.status(401).json({ message: 'Invalid token' });
        }

        req.user = user;
        next();
    });
};

module.exports = { authenticateToken };
