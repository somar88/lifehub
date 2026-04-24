const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const taskRoutes = require('./routes/taskRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const contactRoutes = require('./routes/contactRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const shoppingRoutes = require('./routes/shoppingRoutes');
const telegramRoutes = require('./routes/telegramRoutes');

const app = express();

const corsOrigin = process.env.CLIENT_URL ||
  (process.env.NODE_ENV === 'production' ? null : '*');
if (!corsOrigin) throw new Error('CLIENT_URL must be set in production');
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Static admin dashboard
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// API docs
const swaggerSpec = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/telegram', telegramRoutes);

app.use(errorHandler);

module.exports = app;
