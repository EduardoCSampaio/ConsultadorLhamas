'use client';

// Este arquivo serve como um ponto de entrada para os hooks e componentes do Firebase que são seguros para o cliente.
// A lógica de inicialização foi movida para init.ts para evitar problemas de build em ambientes de servidor.

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
