const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Job = sequelize.define('Job', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        url: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                isUrl: true,
                notEmpty: true
            }
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
            defaultValue: 'pending',
            allowNull: false
        },
        progress: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
            validate: {
                min: 0,
                max: 100
            }
        },
        result: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'JSON object containing job result data'
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Error message if job failed'
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Additional job-specific metadata'
        },
        queuedAt: {
            type: DataTypes.DATE,
            allowNull: true, // Temporarily nullable for migration
            defaultValue: DataTypes.NOW,
            comment: 'Timestamp when job was queued for processing'
        },
        lockedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Timestamp when job was locked for processing'
        },
        lockedBy: {
            type: DataTypes.STRING(100),
            allowNull: true,
            comment: 'Identifier of the process/instance processing this job'
        },
        maxRetries: {
            type: DataTypes.INTEGER,
            defaultValue: 3,
            allowNull: false,
            comment: 'Maximum number of retry attempts'
        },
        retryCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
            comment: 'Current number of retry attempts'
        }
    }, {
        tableName: 'jobs',
        timestamps: true,
        indexes: [
            {
                fields: ['userId']
            },
            {
                fields: ['status']
            },
            {
                fields: ['createdAt']
            },
            {
                fields: ['status', 'queuedAt'],
                name: 'jobs_status_queued_at_idx'
            },
            {
                fields: ['lockedAt'],
                name: 'jobs_locked_at_idx'
            }
        ]
    });

    Job.associate = (models) => {
        Job.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    return Job;
};