import Joi from 'joi';

export const envValidationSchema = Joi.object({
  nodeEnv: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  port: Joi.number().default(3000),
  database: Joi.object({
    url: Joi.string().required(),
  }),
  jwt: Joi.object({
    secret: Joi.string().required(),
    refreshSecret: Joi.string().required(),
  }),
});
