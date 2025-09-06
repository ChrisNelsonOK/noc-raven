# 🦅 NoC Raven - Terminal Menu Makefile
# Build system for the ncurses-based terminal interface

# Compiler and flags
CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -O2 -g
LDFLAGS = -lncurses

# Directories
SRCDIR = .
OBJDIR = obj
BINDIR = .

# Source files
SOURCES = terminal-menu.c
OBJECTS = $(OBJDIR)/terminal-menu.o
TARGET = terminal-menu

# Default target
.PHONY: all clean install uninstall

all: $(TARGET)

# Create object directory
$(OBJDIR):
	mkdir -p $(OBJDIR)

# Compile source to object files
$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Link object files to create executable
$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) $(LDFLAGS) -o $(TARGET)
	strip $(TARGET)

# Install target (for Docker build)
install: $(TARGET)
	install -m 755 $(TARGET) /opt/noc-raven/bin/$(TARGET)

# Uninstall target
uninstall:
	rm -f /opt/noc-raven/bin/$(TARGET)

# Clean build artifacts
clean:
	rm -rf $(OBJDIR)
	rm -f $(TARGET)

# Debug build
debug: CFLAGS += -DDEBUG -g3
debug: $(TARGET)

# Static build (for Alpine Linux compatibility)
static: LDFLAGS += -static
static: $(TARGET)

# Check for dependencies
check-deps:
	@echo "Checking for required dependencies..."
	@which $(CC) > /dev/null || (echo "Error: gcc not found" && exit 1)
	@echo "#include <ncurses.h>" | $(CC) -E - > /dev/null 2>&1 || (echo "Error: ncurses development headers not found" && exit 1)
	@echo "All dependencies satisfied."

# Show help
help:
	@echo "🦅 NoC Raven Terminal Menu - Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  all        - Build the terminal menu (default)"
	@echo "  clean      - Remove build artifacts"
	@echo "  install    - Install to /opt/noc-raven/bin/"
	@echo "  uninstall  - Remove from /opt/noc-raven/bin/"
	@echo "  debug      - Build with debug symbols"
	@echo "  static     - Build statically linked binary"
	@echo "  check-deps - Check for required dependencies"
	@echo "  help       - Show this help message"
	@echo ""
	@echo "Dependencies:"
	@echo "  - gcc or compatible C compiler"
	@echo "  - ncurses development headers"
	@echo ""
	@echo "Usage examples:"
	@echo "  make              # Build the program"
	@echo "  make clean all    # Clean and rebuild"
	@echo "  make static       # Build static binary for containers"

# Dependencies
$(OBJDIR)/terminal-menu.o: $(SRCDIR)/terminal-menu.c
