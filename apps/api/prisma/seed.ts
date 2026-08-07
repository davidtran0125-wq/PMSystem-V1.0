import {
  FieldType,
  PrismaClient,
  SupplierStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
} from '../src/common/permissions';

const prisma = new PrismaClient();

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.PROCUREMENT_MANAGER]: 'Procurement Manager',
  [ROLES.BUYER]: 'Buyer',
  [ROLES.DEPARTMENT_MANAGER]: 'Department Manager',
  [ROLES.END_USER]: 'End User',
  [ROLES.SUPPLIER]: 'Supplier',
  [ROLES.FINANCE]: 'Finance',
  [ROLES.QA]: 'QA',
  [ROLES.WAREHOUSE]: 'Warehouse',
};

/**
 * Nhóm mua dịch vụ: không quản lý bằng mã vật tư, nên yêu cầu mua thuộc các
 * nhóm này được nhập tự do phần mô tả công việc.
 */
const SERVICE_CATEGORIES = new Set([
  'SERVICE',
  'SOFTWARE',
  'LOGISTICS',
  'TRUCKING',
  'OCEAN_FREIGHT',
  'AIR_FREIGHT',
  'CUSTOMS',
  'MARKETING',
]);

const CATEGORIES = [
  { code: 'CHEMICAL', name: 'Hóa chất', nameEn: 'Chemical' },
  { code: 'PACKAGING', name: 'Bao bì', nameEn: 'Packaging' },
  { code: 'RAW_MATERIAL', name: 'Nguyên vật liệu', nameEn: 'Raw Material' },
  { code: 'MRO', name: 'MRO', nameEn: 'MRO' },
  { code: 'OFFICE_SUPPLIES', name: 'Văn phòng phẩm', nameEn: 'Office Supplies' },
  { code: 'PPE', name: 'Bảo hộ lao động', nameEn: 'PPE' },
  { code: 'IT_EQUIPMENT', name: 'Thiết bị CNTT', nameEn: 'IT Equipment' },
  { code: 'SOFTWARE', name: 'Phần mềm', nameEn: 'Software' },
  { code: 'SERVICE', name: 'Dịch vụ', nameEn: 'Service' },
  { code: 'CAPEX', name: 'Đầu tư CAPEX', nameEn: 'CAPEX' },
  { code: 'MACHINE', name: 'Máy móc', nameEn: 'Machine' },
  { code: 'SPARE_PART', name: 'Phụ tùng', nameEn: 'Spare Part' },
  { code: 'LOGISTICS', name: 'Logistics', nameEn: 'Logistics' },
  { code: 'TRUCKING', name: 'Vận tải đường bộ', nameEn: 'Trucking' },
  { code: 'OCEAN_FREIGHT', name: 'Vận tải biển', nameEn: 'Ocean Freight' },
  { code: 'AIR_FREIGHT', name: 'Vận tải hàng không', nameEn: 'Air Freight' },
  { code: 'CUSTOMS', name: 'Khai báo hải quan', nameEn: 'Customs Clearance' },
  { code: 'MARKETING', name: 'Marketing', nameEn: 'Marketing' },
];

type SeedField = {
  key: string;
  label: string;
  labelEn: string;
  type: FieldType;
  isRequired?: boolean;
  options?: { value: string; label: string }[];
};

const FORMS: Record<string, SeedField[]> = {
  CHEMICAL: [
    { key: 'casNumber', label: 'Số CAS', labelEn: 'CAS Number', type: FieldType.TEXT, isRequired: true },
    { key: 'concentration', label: 'Nồng độ', labelEn: 'Concentration', type: FieldType.TEXT },
    { key: 'packing', label: 'Quy cách đóng gói', labelEn: 'Packing', type: FieldType.TEXT },
    { key: 'sdsRequired', label: 'Yêu cầu SDS', labelEn: 'SDS Required', type: FieldType.CHECKBOX },
    { key: 'quantity', label: 'Số lượng', labelEn: 'Quantity', type: FieldType.DECIMAL, isRequired: true },
  ],
  MACHINE: [
    { key: 'model', label: 'Model', labelEn: 'Model', type: FieldType.TEXT, isRequired: true },
    { key: 'brand', label: 'Thương hiệu', labelEn: 'Brand', type: FieldType.TEXT },
    { key: 'capacity', label: 'Công suất', labelEn: 'Capacity', type: FieldType.TEXT },
    { key: 'installationRequirement', label: 'Yêu cầu lắp đặt', labelEn: 'Installation Requirement', type: FieldType.TEXTAREA },
  ],
  LOGISTICS: [
    { key: 'pol', label: 'Cảng đi (POL)', labelEn: 'POL', type: FieldType.TEXT, isRequired: true },
    { key: 'pod', label: 'Cảng đến (POD)', labelEn: 'POD', type: FieldType.TEXT, isRequired: true },
    {
      key: 'incoterm',
      label: 'Incoterm',
      labelEn: 'Incoterm',
      type: FieldType.SELECT,
      options: ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'].map((v) => ({ value: v, label: v })),
    },
    { key: 'container', label: 'Loại container', labelEn: 'Container', type: FieldType.TEXT },
    { key: 'cargo', label: 'Loại hàng', labelEn: 'Cargo', type: FieldType.TEXT },
    { key: 'grossWeight', label: 'Trọng lượng (kg)', labelEn: 'Gross Weight (kg)', type: FieldType.DECIMAL },
    { key: 'cbm', label: 'Thể tích (CBM)', labelEn: 'CBM', type: FieldType.DECIMAL },
  ],
  SERVICE: [
    { key: 'scopeOfWork', label: 'Phạm vi công việc', labelEn: 'Scope of Work', type: FieldType.TEXTAREA, isRequired: true },
    { key: 'timeline', label: 'Tiến độ', labelEn: 'Timeline', type: FieldType.TEXT },
    { key: 'deliverables', label: 'Sản phẩm bàn giao', labelEn: 'Deliverables', type: FieldType.TEXTAREA },
  ],
  IT_EQUIPMENT: [
    { key: 'model', label: 'Model', labelEn: 'Model', type: FieldType.TEXT, isRequired: true },
    { key: 'specification', label: 'Cấu hình', labelEn: 'Specification', type: FieldType.TEXTAREA },
    { key: 'warrantyMonths', label: 'Bảo hành (tháng)', labelEn: 'Warranty (months)', type: FieldType.NUMBER },
  ],
};

async function seedPermissions() {
  for (const code of Object.values(PERMISSIONS)) {
    const [module, action] = code.split(':');
    await prisma.permission.upsert({
      where: { code },
      update: { module, action },
      create: { code, module, action },
    });
  }
}

async function seedRoles() {
  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code] ?? code },
      create: { code, name: ROLE_LABELS[code] ?? code, isSystem: true },
    });

    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: permissions } },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}

async function seedCategoriesAndForms() {
  for (const category of CATEGORIES) {
    const requiresMaterial = !SERVICE_CATEGORIES.has(category.code);
    const row = await prisma.category.upsert({
      where: { code: category.code },
      update: { name: category.name, nameEn: category.nameEn, requiresMaterial },
      create: { ...category, requiresMaterial },
    });

    const fields = FORMS[category.code];
    if (!fields) continue;

    const form = await prisma.dynamicForm.upsert({
      where: { categoryId_version: { categoryId: row.id, version: 1 } },
      update: {},
      create: {
        categoryId: row.id,
        name: `${category.nameEn} form`,
        version: 1,
      },
    });

    for (const [index, field] of fields.entries()) {
      await prisma.dynamicField.upsert({
        where: { formId_key: { formId: form.id, key: field.key } },
        update: {
          label: field.label,
          labelEn: field.labelEn,
          type: field.type,
          isRequired: field.isRequired ?? false,
          sortOrder: index,
          options: field.options ?? undefined,
        },
        create: {
          formId: form.id,
          key: field.key,
          label: field.label,
          labelEn: field.labelEn,
          type: field.type,
          isRequired: field.isRequired ?? false,
          sortOrder: index,
          options: field.options ?? undefined,
        },
      });
    }
  }
}

async function seedDepartments() {
  const departments = [
    { code: 'PROC', name: 'Procurement' },
    { code: 'PROD', name: 'Production' },
    { code: 'QA', name: 'Quality Assurance' },
    { code: 'IT', name: 'Information Technology' },
    { code: 'FIN', name: 'Finance' },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
  }
}

async function seedUsers() {
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
  const passwordHash = await bcrypt.hash(password, 12);
  const procurement = await prisma.department.findUniqueOrThrow({
    where: { code: 'PROC' },
  });
  const production = await prisma.department.findUniqueOrThrow({
    where: { code: 'PROD' },
  });
  const finance = await prisma.department.findUniqueOrThrow({
    where: { code: 'FIN' },
  });
  const qa = await prisma.department.findUniqueOrThrow({ where: { code: 'QA' } });

  const accounts = [
    {
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@pms.local',
      fullName: 'System Administrator',
      role: ROLES.SUPER_ADMIN,
      departmentId: procurement.id,
    },
    {
      email: 'buyer@pms.local',
      fullName: 'Buyer Nguyen',
      role: ROLES.BUYER,
      departmentId: procurement.id,
    },
    {
      email: 'user@pms.local',
      fullName: 'End User Tran',
      role: ROLES.END_USER,
      departmentId: production.id,
    },
    {
      email: 'manager@pms.local',
      fullName: 'Department Manager Le',
      role: ROLES.DEPARTMENT_MANAGER,
      departmentId: production.id,
    },
    // Hai cấp cuối của chuỗi duyệt cho yêu cầu trên 500 triệu.
    {
      email: 'finance@pms.local',
      fullName: 'Finance Pham',
      role: ROLES.FINANCE,
      departmentId: finance.id,
    },
    {
      email: 'director@pms.local',
      fullName: 'Director Vo',
      role: ROLES.PROCUREMENT_MANAGER,
      departmentId: procurement.id,
    },
    // Hai vai trò còn lại, để cả 9 vai trò đều demo được.
    {
      email: 'qa@pms.local',
      fullName: 'QA Hoang',
      role: ROLES.QA,
      departmentId: qa.id,
    },
    {
      email: 'warehouse@pms.local',
      fullName: 'Warehouse Dang',
      role: ROLES.WAREHOUSE,
      departmentId: production.id,
    },
  ];

  for (const account of accounts) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: account.role },
    });
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { fullName: account.fullName, departmentId: account.departmentId },
      create: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        departmentId: account.departmentId,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
}

/**
 * Two approved suppliers so the RFQ and quotation flow can be tried straight
 * after seeding. The SUP sequence is advanced to match, otherwise the next
 * self-registration would generate a code that already exists.
 */
async function seedSuppliers() {
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
  const passwordHash = await bcrypt.hash(password, 12);
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.SUPPLIER },
  });
  const year = new Date().getFullYear();

  const suppliers = [
    {
      code: `SUP-${year}-00001`,
      companyName: 'Công ty TNHH Hóa chất Miền Nam',
      email: 'ncc-a@pms.local',
      contactPerson: 'Nguyễn Văn A',
      taxCode: '0301234567',
      address: 'Quận 7, TP. Hồ Chí Minh',
      paymentTerm: 'Net 30',
      categories: ['CHEMICAL', 'RAW_MATERIAL'],
    },
    {
      code: `SUP-${year}-00002`,
      companyName: 'Công ty CP Thiết bị Công nghiệp Việt',
      email: 'ncc-b@pms.local',
      contactPerson: 'Trần Thị B',
      taxCode: '0307654321',
      address: 'Bình Dương',
      paymentTerm: 'Net 15',
      categories: ['MACHINE', 'SPARE_PART'],
    },
  ];

  for (const entry of suppliers) {
    const { categories, ...data } = entry;

    const supplier = await prisma.supplier.upsert({
      where: { code: data.code },
      update: {},
      create: {
        ...data,
        status: SupplierStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    const categoryRows = await prisma.category.findMany({
      where: { code: { in: categories } },
      select: { id: true },
    });
    await prisma.supplierCategory.createMany({
      data: categoryRows.map((c) => ({
        supplierId: supplier.id,
        categoryId: c.id,
      })),
      skipDuplicates: true,
    });

    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: { supplierId: supplier.id },
      create: {
        email: data.email,
        passwordHash,
        fullName: data.contactPerson,
        supplierId: supplier.id,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  const sequenceKey = `sequence:SUP:${year}`;
  const current = await prisma.setting.findUnique({
    where: { key: sequenceKey },
  });
  if (!current || Number(current.value) < suppliers.length) {
    await prisma.setting.upsert({
      where: { key: sequenceKey },
      update: { value: suppliers.length },
      create: { key: sequenceKey, value: suppliers.length },
    });
  }
}

/**
 * Bộ tiêu chí đánh giá mặc định. Người dùng có thể sửa, thêm, tắt hoặc đổi
 * trọng số trong phần Thiết lập — seed chỉ tạo lần đầu, không ghi đè.
 */
async function seedEvaluationCriteria() {
  const defaults = [
    { name: 'Giá', description: 'Mức giá so với mặt bằng thị trường', weight: 25 },
    { name: 'Chất lượng', description: 'Chất lượng hàng hóa / dịch vụ giao nhận', weight: 30 },
    { name: 'Giao hàng', description: 'Đúng hạn, đúng số lượng, đóng gói đạt yêu cầu', weight: 20 },
    { name: 'Thời gian phản hồi', description: 'Tốc độ phản hồi yêu cầu và báo giá', weight: 10 },
    { name: 'Hợp tác', description: 'Thiện chí xử lý sự cố và hỗ trợ kỹ thuật', weight: 15 },
  ];

  for (const [index, entry] of defaults.entries()) {
    const existing = await prisma.evaluationCriteria.findFirst({
      where: { name: entry.name, deletedAt: null },
    });
    if (existing) continue;

    await prisma.evaluationCriteria.create({
      data: { ...entry, sortOrder: index, maxScore: 5, isSystem: true },
    });
  }
}

async function seedApprovalWorkflows() {
  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.BUYER },
  });
  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.DEPARTMENT_MANAGER },
  });
  const directorRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.PROCUREMENT_MANAGER },
  });
  const financeRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.FINANCE },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLES.SUPER_ADMIN },
  });

  const tiers = [
    {
      name: 'Dưới 100 triệu',
      minAmount: 0,
      maxAmount: 100_000_000,
      steps: [{ name: 'Buyer review', roleId: buyerRole.id }],
    },
    {
      name: 'Từ 100 đến 500 triệu',
      minAmount: 100_000_000,
      maxAmount: 500_000_000,
      steps: [
        { name: 'Department Manager', roleId: managerRole.id },
        { name: 'Buyer review', roleId: buyerRole.id },
      ],
    },
    {
      name: 'Trên 500 triệu',
      minAmount: 500_000_000,
      maxAmount: null,
      steps: [
        { name: 'Department Manager', roleId: managerRole.id },
        { name: 'Buyer review', roleId: buyerRole.id },
        { name: 'Finance', roleId: financeRole.id },
        { name: 'Director', roleId: directorRole.id },
      ],
    },
  ];

  // Đơn hàng duyệt gọn hơn yêu cầu mua: giá đã chốt qua đấu thầu rồi, nên chỉ
  // cần soát lại trước khi phát hành ra ngoài.
  const orderTiers = [
    {
      name: 'Đơn hàng dưới 200 triệu',
      minAmount: 0,
      maxAmount: 200_000_000,
      steps: [{ name: 'Trưởng bộ phận mua hàng', roleId: directorRole.id }],
    },
    {
      name: 'Đơn hàng từ 200 triệu đến 1 tỷ',
      minAmount: 200_000_000,
      maxAmount: 1_000_000_000,
      steps: [
        { name: 'Trưởng bộ phận mua hàng', roleId: directorRole.id },
        { name: 'Kế toán trưởng', roleId: financeRole.id },
      ],
    },
    {
      name: 'Đơn hàng trên 1 tỷ',
      minAmount: 1_000_000_000,
      maxAmount: null,
      steps: [
        { name: 'Trưởng bộ phận mua hàng', roleId: directorRole.id },
        { name: 'Kế toán trưởng', roleId: financeRole.id },
        { name: 'Ban giám đốc', roleId: adminRole.id },
      ],
    },
  ];

  const all = [
    ...tiers.map((t) => ({ ...t, appliesTo: 'PURCHASE_REQUEST' as const })),
    ...orderTiers.map((t) => ({ ...t, appliesTo: 'PURCHASE_ORDER' as const })),
  ];

  for (const tier of all) {
    const existing = await prisma.approvalWorkflow.findFirst({
      where: { name: tier.name },
    });
    if (existing) continue;

    await prisma.approvalWorkflow.create({
      data: {
        name: tier.name,
        appliesTo: tier.appliesTo,
        minAmount: tier.minAmount,
        maxAmount: tier.maxAmount,
        steps: {
          create: tier.steps.map((step, index) => ({
            stepOrder: index + 1,
            name: step.name,
            roleId: step.roleId,
          })),
        },
      },
    });
  }
}

/**
 * Vài mã vật tư mẫu đã ban hành, để danh mục và lịch sử đặt hàng có dữ liệu
 * ngay từ lần chạy đầu.
 */
async function seedMaterials() {
  const admin = await prisma.user.findUnique({
    where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@pms.local' },
  });
  const byCode = async (code: string) =>
    prisma.category.findUnique({ where: { code } });

  const chemical = await byCode('CHEMICAL');
  const packaging = (await byCode('PACKAGING')) ?? chemical;
  const machine = await byCode('MACHINE');

  const materials = [
    {
      code: 'HC-NAOH-32',
      name: 'Xút NaOH 32%',
      nameEn: 'Sodium hydroxide 32%',
      specification: 'CAS 1310-73-2, nồng độ 32% ± 0,5%, xe bồn hoặc IBC 1000L',
      unit: 'kg',
      categoryId: chemical?.id,
      hsCode: '28151100',
      standardPrice: 19000,
      minStock: 2000,
    },
    {
      code: 'HC-H2SO4-98',
      name: 'Axit sulfuric 98%',
      nameEn: 'Sulfuric acid 98%',
      specification: 'CAS 7664-93-9, tinh khiết kỹ thuật, phuy 35L',
      unit: 'kg',
      categoryId: chemical?.id,
      hsCode: '28070010',
      standardPrice: 12500,
      minStock: 1000,
    },
    {
      code: 'BB-CAN-25L',
      name: 'Can nhựa HDPE 25L',
      nameEn: 'HDPE jerrycan 25L',
      specification: 'HDPE nguyên sinh, nắp ren có gioăng, chịu hóa chất',
      unit: 'cái',
      categoryId: packaging?.id,
      standardPrice: 52000,
      minStock: 200,
    },
    {
      code: 'BB-IBC-1000',
      name: 'Bồn IBC 1000L',
      nameEn: 'IBC tank 1000L',
      specification: 'Khung thép, ruột HDPE, van xả DN50',
      unit: 'cái',
      categoryId: packaging?.id,
      standardPrice: 2350000,
      minStock: 20,
    },
    {
      code: 'MTB-BOM-CN40',
      name: 'Bơm ly tâm hóa chất CN40',
      nameEn: 'Chemical centrifugal pump CN40',
      specification: 'Lưu lượng 40 m³/h, cột áp 32 m, vật liệu PP, motor 7,5 kW',
      unit: 'bộ',
      categoryId: machine?.id,
      manufacturer: 'Ebara',
      standardPrice: 48000000,
      minStock: 1,
    },
  ];

  for (const m of materials) {
    await prisma.material.upsert({
      where: { code: m.code },
      update: {},
      create: {
        ...m,
        status: 'ACTIVE',
        createdById: admin?.id,
        approvedById: admin?.id,
        approvedAt: new Date(),
      },
    });
  }

  console.log(`  ${materials.length} mã vật tư mẫu`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedDepartments();
  await seedCategoriesAndForms();
  await seedUsers();
  await seedSuppliers();
  await seedEvaluationCriteria();
  await seedMaterials();
  await seedApprovalWorkflows();
  console.log('Seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
