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
    const row = await prisma.category.upsert({
      where: { code: category.code },
      update: { name: category.name, nameEn: category.nameEn },
      create: category,
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

  for (const tier of tiers) {
    const existing = await prisma.approvalWorkflow.findFirst({
      where: { name: tier.name },
    });
    if (existing) continue;

    await prisma.approvalWorkflow.create({
      data: {
        name: tier.name,
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

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedDepartments();
  await seedCategoriesAndForms();
  await seedUsers();
  await seedSuppliers();
  await seedApprovalWorkflows();
  console.log('Seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
