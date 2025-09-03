const nodemailer = require('nodemailer');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const path = require('path');
const fs = require('fs');

class EmailService {
    constructor() {
        this.transporter = null;
        this.sesClient = null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        // Check email service type
        if (process.env.EMAIL_SERVICE === 'SES') {
            // Use AWS SDK v3 SES client
            this.sesClient = new SESv2Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                }
            });
        } else if (process.env.EMAIL_SERVICE === 'MAILGUN') {
            // Use Mailgun SMTP transport
            const mailgunConfig = {
                host: 'smtp.mailgun.org',
                port: 587,
                secure: false, // Use TLS
                auth: {
                    user: process.env.MAILGUN_SMTP_LOGIN,
                    pass: process.env.MAILGUN_SMTP_PASSWORD
                }
            };
            this.transporter = nodemailer.createTransport(mailgunConfig);
        } else {
            // Use regular SMTP transport
            const emailConfig = {
                host: process.env.SMTP_HOST || 'localhost',
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };
            this.transporter = nodemailer.createTransport(emailConfig);
        }
    }

    async sendEmail(to, subject, htmlContent, textContent = null) {
        try {
            if (this.sesClient) {
                // Use AWS SES v2 SDK
                const params = {
                    FromEmailAddress: process.env.EMAIL_FROM || 'noreply@wishlistwebsite.com',
                    Destination: {
                        ToAddresses: [to]
                    },
                    Content: {
                        Simple: {
                            Subject: {
                                Data: subject,
                                Charset: 'UTF-8'
                            },
                            Body: {
                                Html: {
                                    Data: htmlContent,
                                    Charset: 'UTF-8'
                                },
                                Text: {
                                    Data: textContent || this.stripHtml(htmlContent),
                                    Charset: 'UTF-8'
                                }
                            }
                        }
                    }
                };

                const command = new SendEmailCommand(params);
                const result = await this.sesClient.send(command);
                console.log('Email sent successfully via SES:', result.MessageId);
                return result;
            } else {
                // Use regular SMTP transport
                const mailOptions = {
                    from: process.env.EMAIL_FROM || 'noreply@wishlist.com',
                    to,
                    subject,
                    html: htmlContent,
                    text: textContent || this.stripHtml(htmlContent)
                };

                const result = await this.transporter.sendMail(mailOptions);
                console.log('Email sent successfully via SMTP:', result.messageId);
                return result;
            }
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    stripHtml(html) {
        return html.replace(/<[^>]*>/g, '');
    }

    async sendPasswordResetEmail(email, resetToken, userName) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

        const subject = 'Password Reset Request';
        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
                        .content { padding: 20px; }
                        .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
                        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Request</h1>
                        </div>
                        <div class="content">
                            <p>Hello ${userName},</p>
                            <p>We received a request to reset your password. Click the button below to reset your password:</p>
                            <p style="text-align: center; margin: 30px 0;">
                                <a href="${resetUrl}" class="button">Reset Password</a>
                            </p>
                            <p>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
                            <p>This link will expire in 15 minutes for security purposes.</p>
                        </div>
                        <div class="footer">
                            <p>If you're having trouble clicking the button, copy and paste the following URL into your browser:</p>
                            <p>${resetUrl}</p>
                        </div>
                    </div>
                </body>
            </html>
        `;

        const textContent = `
            Hello ${userName},

            We received a request to reset your password. Click the link below to reset your password:

            ${resetUrl}

            If you did not request this password reset, please ignore this email. Your password will remain unchanged.

            This link will expire in 15 minutes for security purposes.
        `;

        return this.sendEmail(email, subject, htmlContent, textContent);
    }

    async sendGroupInvitationEmail(email, groupName, inviterName, userName) {
        const signupUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/signup`;

        const subject = `You've been invited to join "${groupName}" on Wishlist`;
        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
                        .content { padding: 20px; }
                        .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; }
                        .group-name { color: #007bff; font-weight: bold; }
                        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎁 You're Invited!</h1>
                        </div>
                        <div class="content">
                            <p>Hello${userName ? ` ${userName}` : ''},</p>
                            <p>${inviterName} has invited you to join the <span class="group-name">"${groupName}"</span> group on Wishlist!</p>
                            <p>Wishlist is a platform where you can create and share wishlists with friends and family, making gift-giving easier and more meaningful.</p>
                            <p>Join us to:</p>
                            <ul>
                                <li>Create and manage your personal wishlists</li>
                                <li>Share your wishes with group members</li>
                                <li>Discover what others are hoping for</li>
                                <li>Coordinate gifts to avoid duplicates</li>
                            </ul>
                            <p style="text-align: center; margin: 30px 0;">
                                <a href="${signupUrl}" class="button">Join Wishlist</a>
                            </p>
                            <p>Once you create your account, you'll automatically be added to the "${groupName}" group and can start exploring everyone's wishlists!</p>
                        </div>
                        <div class="footer">
                            <p>If you're having trouble clicking the button, copy and paste the following URL into your browser:</p>
                            <p>${signupUrl}</p>
                            <p>This invitation was sent by ${inviterName}. If you don't know this person or received this email by mistake, you can safely ignore it.</p>
                        </div>
                    </div>
                </body>
            </html>
        `;

        const textContent = `
            Hello${userName ? ` ${userName}` : ''},

            ${inviterName} has invited you to join the "${groupName}" group on Wishlist!

            Wishlist is a platform where you can create and share wishlists with friends and family, making gift-giving easier and more meaningful.

            Join us to:
            • Create and manage your personal wishlists
            • Share your wishes with group members
            • Discover what others are hoping for
            • Coordinate gifts to avoid duplicates

            Join Wishlist: ${signupUrl}

            Once you create your account, you'll automatically be added to the "${groupName}" group and can start exploring everyone's wishlists!

            This invitation was sent by ${inviterName}. If you don't know this person or received this email by mistake, you can safely ignore it.
        `;

        return this.sendEmail(email, subject, htmlContent, textContent);
    }

    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('Email service connection verified successfully');
            return true;
        } catch (error) {
            console.error('Email service connection failed:', error);
            return false;
        }
    }
}

module.exports = new EmailService();
