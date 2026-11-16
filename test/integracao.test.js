import app from '../src/app.js';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDatabase } from './utils/clearDatabase.js';
import { MontadoraFactory } from './factories/MontadoraFactory.js';

vi.mock('../src/utils/consultarCep.js', () => ({
  consultarCep: vi.fn(async (cep) => ({
    cep: String(cep).replace(/\D+/g, ''),
    logradouro: 'Rua Teste',
    bairro: 'Centro',
    cidade: 'São Paulo',
    uf: 'SP',
  })),
}));

const api = () => request(app);
const clientePayload = (nome = 'Cliente Teste', cpf = '12345678901') => ({
  nome, cpf, cep: '01001000', numero: '100', complemento: 'Apto 1',
});

describe('Integração - API Automóveis', () => {
  beforeEach(async () => { await clearDatabase(); vi.clearAllMocks(); });
  afterEach(async () => { await clearDatabase(); vi.resetAllMocks(); });

  describe('Montadoras', () => {
    it('CRUD e listagem', async () => {
      const create = await api().post('/montadoras').send({ nome: 'Toyota', pais: 'Japão' });
      expect(create.status).toBe(201);
      expect(create.body.data).toHaveProperty('insertId');
      const id = create.body.data.insertId;

      await MontadoraFactory.create('Honda', 'Japão');
      const list = await api().get('/montadoras');
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(2);

      const update = await api().put('/montadoras').query({ id }).send({ nome: 'Toyota BR', pais: 'Brasil' });
      expect(update.status).toBe(200);
      expect(update.body.data.affectedRows).toBe(1);

      const del = await api().delete(`/montadoras/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.affectedRows).toBe(1);
    });

    it('retorna 404 para montadora inexistente em update/delete', async () => {
      const update = await api().put('/montadoras').query({ id: 99999 }).send({ nome: 'X', pais: 'Y' });
      const del = await api().delete('/montadoras/99999');
      expect(update.status).toBe(404);
      expect(del.status).toBe(404);
    });
  });

  describe('Clientes', () => {
    it('CRUD e listagem', async () => {
      const create = await api().post('/clientes').send(clientePayload());
      expect(create.status).toBe(201);
      expect(create.body.data).toHaveProperty('insertId');
      const id = create.body.data.insertId;

      await api().post('/clientes').send(clientePayload('Cliente 2', '22222222222'));
      const list = await api().get('/clientes');
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(2);

      const update = await api().put('/clientes').query({ id }).send(clientePayload('Cliente Atualizado', '12345678901'));
      expect(update.status).toBe(200);
      expect(update.body.data.affectedRows).toBe(1);

      const del = await api().delete(`/clientes/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.affectedRows).toBe(1);
    });
  });

  describe('Veículos', () => {
    it('CRUD e listagem', async () => {
      const montadora = await MontadoraFactory.create('Ford', 'EUA');
      const cliente = await api().post('/clientes').send(clientePayload('Dono', '33333333333'));
      const idCliente = cliente.body.data.insertId;

      const veiculoBase = {
        idMontadora: montadora.Id, idCliente, modelo: 'Focus', placa: 'ABC1D23', ano: 2020, cor: 'Azul', valor: 80000,
      };
      const create = await api().post('/veiculos').send(veiculoBase);
      expect(create.status).toBe(201);
      expect(create.body.data).toHaveProperty('insertId');
      const id = create.body.data.insertId;

      const list = await api().get('/veiculos');
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toHaveProperty('Modelo', 'Focus');

      const update = await api().put('/veiculos').query({ id }).send({ ...veiculoBase, modelo: 'Focus Titanium', cor: 'Preto' });
      expect(update.status).toBe(200);
      expect(update.body.data.affectedRows).toBe(1);

      const del = await api().delete(`/veiculos/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.affectedRows).toBe(1);
    });
  });

  describe('Fluxo de uso', () => {
    it('cadastro, vínculo, atualização e remoção completa', async () => {
      const m = await api().post('/montadoras').send({ nome: 'Hyundai', pais: 'Coreia do Sul' });
      const c = await api().post('/clientes').send(clientePayload('Fluxo Cliente', '99999999999'));
      const idMontadora = m.body.data.insertId;
      const idCliente = c.body.data.insertId;

      const v = await api().post('/veiculos').send({
        idMontadora, idCliente, modelo: 'HB20', placa: 'QRS3T45', ano: 2024, cor: 'Cinza', valor: 95000,
      });
      expect(v.status).toBe(201);
      const idVeiculo = v.body.data.insertId;

      const list = await api().get('/veiculos');
      expect(list.body.data[0].Montadora).toBe('Hyundai');
      expect(list.body.data[0].Cliente).toBe('Fluxo Cliente');

      await api().put('/veiculos').query({ id: idVeiculo }).send({
        idMontadora, idCliente, modelo: 'HB20 Comfort', placa: 'QRS3T45', ano: 2024, cor: 'Preto', valor: 98000,
      });
      await api().delete(`/veiculos/${idVeiculo}`);
      await api().delete(`/clientes/${idCliente}`);
      await api().delete(`/montadoras/${idMontadora}`);

      expect((await api().get('/veiculos')).body.data).toHaveLength(0);
      expect((await api().get('/clientes')).body.data).toHaveLength(0);
      expect((await api().get('/montadoras')).body.data).toHaveLength(0);
    });
  });
});
