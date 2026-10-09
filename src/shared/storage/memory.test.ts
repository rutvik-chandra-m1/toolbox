import { describeStorageBackend } from './collection-contract';
import { createMemoryStorage } from './memory';

describeStorageBackend('in-memory', createMemoryStorage);
