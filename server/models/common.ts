import { SchemaOptions } from 'mongoose';

export const baseSchemaOptions: SchemaOptions = {
  timestamps: false,
  versionKey: false,
  strict: false,
  toJSON: {
    virtuals: true,
    transform: (_doc: any, ret: any) => {
      if (!ret.id && ret._id) ret.id = ret._id;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc: any, ret: any) => {
      if (!ret.id && ret._id) ret.id = ret._id;
      return ret;
    },
  },
};

