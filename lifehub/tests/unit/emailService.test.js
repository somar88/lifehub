const emailService = require('../../src/services/emailService');

jest.mock('../../src/services/emailService');

describe('Email Service (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports sendWelcomeEmail and sendPasswordResetEmail', () => {
    const real = jest.requireActual('../../src/services/emailService');
    expect(typeof real.sendWelcomeEmail).toBe('function');
    expect(typeof real.sendPasswordResetEmail).toBe('function');
  });

  it('mock resolves without throwing', async () => {
    emailService.sendWelcomeEmail.mockResolvedValue();
    await expect(emailService.sendWelcomeEmail('a@b.com', 'Alice')).resolves.toBeUndefined();
  });

  it('mock can simulate send failure', async () => {
    emailService.sendWelcomeEmail.mockRejectedValue(new Error('SMTP error'));
    await expect(emailService.sendWelcomeEmail('a@b.com', 'Alice')).rejects.toThrow('SMTP error');
  });
});
