-- GrocerAI v2 schema. Times are UTC (DATETIME2). Money is DECIMAL(12,2); prices include VAT.

-- v1 tables (JSON-era port) are replaced; they held only demo data.
IF OBJECT_ID(N'dbo.SaleItems') IS NOT NULL DROP TABLE dbo.SaleItems;
IF OBJECT_ID(N'dbo.Sales') IS NOT NULL DROP TABLE dbo.Sales;
IF OBJECT_ID(N'dbo.PendingCheckoutItems') IS NOT NULL DROP TABLE dbo.PendingCheckoutItems;
IF OBJECT_ID(N'dbo.PendingCheckouts') IS NOT NULL DROP TABLE dbo.PendingCheckouts;
IF OBJECT_ID(N'dbo.StockAlerts') IS NOT NULL DROP TABLE dbo.StockAlerts;
IF OBJECT_ID(N'dbo.Products') IS NOT NULL DROP TABLE dbo.Products;
GO

CREATE TABLE dbo.Users (
  Id           INT IDENTITY(1, 1) PRIMARY KEY,
  Username     NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
  DisplayName  NVARCHAR(100) NOT NULL,
  PasswordHash NVARCHAR(200) NOT NULL,
  Role         NVARCHAR(20)  NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN (N'admin', N'manager', N'cashier')),
  IsActive     BIT           NOT NULL DEFAULT 1,
  FailedLogins INT           NOT NULL DEFAULT 0,
  LockedUntil  DATETIME2     NULL,
  LastLoginAt  DATETIME2     NULL,
  CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Sessions (
  TokenHash CHAR(64)      NOT NULL PRIMARY KEY,
  UserId    INT           NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,
  ExpiresAt DATETIME2     NOT NULL,
  CreatedAt DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  Ip        NVARCHAR(64)  NULL,
  UserAgent NVARCHAR(300) NULL
);
CREATE INDEX IX_Sessions_UserId ON dbo.Sessions(UserId);

CREATE TABLE dbo.AuditLog (
  Id        BIGINT IDENTITY(1, 1) PRIMARY KEY,
  UserId    INT            NULL REFERENCES dbo.Users(Id),
  Action    NVARCHAR(60)   NOT NULL,
  Entity    NVARCHAR(40)   NOT NULL,
  EntityId  NVARCHAR(60)   NULL,
  Details   NVARCHAR(MAX)  NULL,
  Ip        NVARCHAR(64)   NULL,
  CreatedAt DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_AuditLog_CreatedAt ON dbo.AuditLog(CreatedAt DESC);

-- Single-row settings table.
CREATE TABLE dbo.Settings (
  Id                 INT            NOT NULL PRIMARY KEY CONSTRAINT CK_Settings_Single CHECK (Id = 1),
  StoreName          NVARCHAR(100)  NOT NULL,
  StoreAddress       NVARCHAR(300)  NOT NULL DEFAULT N'',
  StorePhone         NVARCHAR(30)   NOT NULL DEFAULT N'',
  TaxId              NVARCHAR(20)   NOT NULL DEFAULT N'',
  PromptPayId        NVARCHAR(20)   NOT NULL DEFAULT N'',
  VatRate            DECIMAL(5, 2)  NOT NULL DEFAULT 7,
  ReceiptFooter      NVARCHAR(300)  NOT NULL DEFAULT N'',
  OrderExpiryMinutes INT            NOT NULL DEFAULT 30,
  UpdatedAt          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
INSERT INTO dbo.Settings (Id, StoreName) VALUES (1, N'GrocerAI');

CREATE TABLE dbo.Categories (
  Id        INT IDENTITY(1, 1) PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
  SortOrder INT           NOT NULL DEFAULT 0
);

CREATE TABLE dbo.Products (
  Id          INT IDENTITY(1, 1) PRIMARY KEY,
  Sku         NVARCHAR(40)   NOT NULL CONSTRAINT UQ_Products_Sku UNIQUE,
  Barcode     NVARCHAR(40)   NOT NULL DEFAULT N'',
  Name        NVARCHAR(200)  NOT NULL,
  Description NVARCHAR(1000) NOT NULL DEFAULT N'',
  CategoryId  INT            NOT NULL REFERENCES dbo.Categories(Id),
  Price       DECIMAL(12, 2) NOT NULL CHECK (Price >= 0),
  PromoPrice  DECIMAL(12, 2) NULL,
  Stock       INT            NOT NULL DEFAULT 0 CONSTRAINT CK_Products_Stock CHECK (Stock >= 0),
  MinStock    INT            NOT NULL DEFAULT 5 CHECK (MinStock >= 0),
  IsActive    BIT            NOT NULL DEFAULT 1,
  CreatedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Products_Promo CHECK (PromoPrice IS NULL OR (PromoPrice >= 0 AND PromoPrice < Price))
);
CREATE INDEX IX_Products_Category ON dbo.Products(CategoryId);
CREATE INDEX IX_Products_Barcode ON dbo.Products(Barcode) WHERE Barcode <> N'';

-- Stock ledger: every change to Products.Stock is written here in the same transaction.
CREATE TABLE dbo.StockMovements (
  Id         BIGINT IDENTITY(1, 1) PRIMARY KEY,
  ProductId  INT           NOT NULL REFERENCES dbo.Products(Id),
  Change     INT           NOT NULL,
  StockAfter INT           NOT NULL,
  Reason     NVARCHAR(20)  NOT NULL CHECK (Reason IN (N'sale', N'order', N'order-cancel', N'restock', N'adjustment', N'initial')),
  RefNo      NVARCHAR(30)  NULL,
  Note       NVARCHAR(300) NOT NULL DEFAULT N'',
  UserId     INT           NULL REFERENCES dbo.Users(Id),
  CreatedAt  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_StockMovements_Product ON dbo.StockMovements(ProductId, CreatedAt DESC);

-- Running numbers per prefix per day (receipts R..., orders W...).
CREATE TABLE dbo.DocumentCounters (
  Prefix NCHAR(1) NOT NULL,
  Day    DATE     NOT NULL,
  LastNo INT      NOT NULL,
  PRIMARY KEY (Prefix, Day)
);

-- Online orders from the storefront. Stock is reserved (deducted) when the order is placed
-- and returned when it is cancelled or expires.
CREATE TABLE dbo.Orders (
  Id            INT IDENTITY(1, 1) PRIMARY KEY,
  OrderNo       NVARCHAR(20)   NOT NULL CONSTRAINT UQ_Orders_OrderNo UNIQUE,
  AccessKey     CHAR(32)       NOT NULL,
  CustomerName  NVARCHAR(100)  NOT NULL,
  CustomerPhone NVARCHAR(20)   NOT NULL,
  Note          NVARCHAR(300)  NOT NULL DEFAULT N'',
  Status        NVARCHAR(20)   NOT NULL CHECK (Status IN (N'awaiting_payment', N'paid', N'cancelled', N'expired')),
  Total         DECIMAL(12, 2) NOT NULL,
  CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  ExpiresAt     DATETIME2      NOT NULL,
  PaidAt        DATETIME2      NULL,
  ClosedByUserId INT           NULL REFERENCES dbo.Users(Id)
);
CREATE INDEX IX_Orders_Status ON dbo.Orders(Status, ExpiresAt);

CREATE TABLE dbo.OrderItems (
  OrderId    INT            NOT NULL REFERENCES dbo.Orders(Id) ON DELETE CASCADE,
  LineNumber INT            NOT NULL,
  ProductId  INT            NOT NULL REFERENCES dbo.Products(Id),
  Name       NVARCHAR(200)  NOT NULL,
  Quantity   INT            NOT NULL CHECK (Quantity > 0),
  UnitPrice  DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (OrderId, LineNumber)
);

CREATE TABLE dbo.Sales (
  Id            INT IDENTITY(1, 1) PRIMARY KEY,
  ReceiptNo     NVARCHAR(20)   NOT NULL CONSTRAINT UQ_Sales_ReceiptNo UNIQUE,
  Channel       NVARCHAR(10)   NOT NULL CHECK (Channel IN (N'pos', N'online')),
  OrderId       INT            NULL REFERENCES dbo.Orders(Id),
  PaymentMethod NVARCHAR(20)   NOT NULL CHECK (PaymentMethod IN (N'cash', N'promptpay')),
  Subtotal      DECIMAL(12, 2) NOT NULL,
  VatRate       DECIMAL(5, 2)  NOT NULL,
  VatAmount     DECIMAL(12, 2) NOT NULL,
  Total         DECIMAL(12, 2) NOT NULL,
  CashReceived  DECIMAL(12, 2) NULL,
  Change        DECIMAL(12, 2) NULL,
  CashierId     INT            NULL REFERENCES dbo.Users(Id),
  CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Sales_CreatedAt ON dbo.Sales(CreatedAt);

CREATE TABLE dbo.SaleItems (
  SaleId     INT            NOT NULL REFERENCES dbo.Sales(Id) ON DELETE CASCADE,
  LineNumber INT            NOT NULL,
  ProductId  INT            NOT NULL REFERENCES dbo.Products(Id),
  Name       NVARCHAR(200)  NOT NULL,
  Quantity   INT            NOT NULL CHECK (Quantity > 0),
  UnitPrice  DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (SaleId, LineNumber)
);
CREATE INDEX IX_SaleItems_Product ON dbo.SaleItems(ProductId);
