import { v4 as uuidv4 } from 'uuid';
import { UserModel, IUser } from '../models/User.ts';
import { TrustedDeviceModel, ITrustedDevice } from '../models/TrustedDevice.ts';
import { DeviceChallengeModel, IDeviceChallenge } from '../models/DeviceChallenge.ts';
import { AuthorizedUserModel, IAuthorizedUser } from '../models/AuthorizedUser.ts';
import { OrganizationModel, IOrganization } from '../models/Organization.ts';

export class UserRepository {
  static async findUserById(id: string): Promise<IUser | null> {
    return (await (UserModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IUser | null;
  }

  static async findUserByEmailOrUsername(identifier: string): Promise<IUser | null> {
    const trimmed = identifier.trim();
    return (await (UserModel as any).findOne({
      $or: [
        { email: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
        { username: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
      ],
    }).lean()) as IUser | null;
  }

  static async createUser(data: Partial<IUser> & { email: string; username: string; password_hash: string; full_name: string; role: string; org_id: string }): Promise<IUser> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    return (await (UserModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
    })) as IUser;
  }

  static async updateUser(id: string, updates: Partial<IUser>): Promise<IUser | null> {
    return (await (UserModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as IUser | null;
  }

  static async listUsers(filter: any = {}): Promise<IUser[]> {
    return (await (UserModel as any).find(filter).sort({ created_at: -1 }).lean()) as IUser[];
  }

  // Device Binding
  static async findTrustedDevice(filter: any): Promise<ITrustedDevice | null> {
    return (await (TrustedDeviceModel as any).findOne(filter).lean()) as ITrustedDevice | null;
  }

  static async findTrustedDevicesByUser(userId: string): Promise<ITrustedDevice[]> {
    return (await (TrustedDeviceModel as any).find({ user_id: userId }).sort({ registered_at: -1 }).lean()) as ITrustedDevice[];
  }

  static async createTrustedDevice(data: Partial<ITrustedDevice> & { org_id: string; user_id: string; device_fingerprint: string; device_name: string; browser_os: string; ip_address: string }): Promise<ITrustedDevice> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const registered_at = data.registered_at || new Date().toISOString();
    const last_seen_at = data.last_seen_at || registered_at;
    return (await (TrustedDeviceModel as any).create({
      ...data,
      _id: id,
      id,
      registered_at,
      last_seen_at,
    })) as ITrustedDevice;
  }

  static async updateTrustedDevice(id: string, updates: Partial<ITrustedDevice>): Promise<ITrustedDevice | null> {
    return (await (TrustedDeviceModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as ITrustedDevice | null;
  }

  // Device Challenges
  static async createDeviceChallenge(data: {
    user_id: string;
    org_id: string;
    device_id?: string;
    device_uuid?: string;
    authentication_attempt_id: string;
    purpose: string;
    challenge: string;
    expires_at: string;
  }): Promise<IDeviceChallenge> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    return (await (DeviceChallengeModel as any).create({
      _id: id,
      id,
      ...data,
      created_at,
    })) as IDeviceChallenge;
  }

  static async findValidDeviceChallenge(userId: string, purpose: string, challenge: string): Promise<IDeviceChallenge | null> {
    const now = new Date().toISOString();
    return (await (DeviceChallengeModel as any).findOne({
      user_id: userId,
      purpose,
      challenge,
      used_at: { $exists: false },
      expires_at: { $gt: now },
    }).lean()) as IDeviceChallenge | null;
  }

  static async consumeDeviceChallenge(id: string): Promise<void> {
    await (DeviceChallengeModel as any).updateOne(
      { $or: [{ _id: id }, { id }] },
      { $set: { used_at: new Date().toISOString() } }
    );
  }

  // Authorized Users & Organizations
  static async findAuthorizedUser(email: string): Promise<IAuthorizedUser | null> {
    return (await (AuthorizedUserModel as any).findOne({
      official_email: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
    }).lean()) as IAuthorizedUser | null;
  }

  static async findOrganization(id: string): Promise<IOrganization | null> {
    return (await (OrganizationModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IOrganization | null;
  }

  static async listOrganizations(): Promise<IOrganization[]> {
    return (await (OrganizationModel as any).find({}).sort({ name: 1 }).lean()) as IOrganization[];
  }
}

export default UserRepository;

